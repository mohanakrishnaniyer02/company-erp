using System.Security.Claims;
using System.Text.Json;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/employees")]
[Authorize]
public class EmployeesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    private static readonly string[] LoginRoles = EmployeeRules.LoginRoles;
    private static readonly Dictionary<string, int> RoleRank = EmployeeRules.RoleRank;

    public EmployeesController(AppDbContext db, IJwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    // GET /api/employees?search=&type=&departmentId=&roleType=
    [HttpGet]
    public async Task<ActionResult<IEnumerable<EmployeeListItem>>> GetAll(
        [FromQuery] string? search, [FromQuery] string? type, [FromQuery] int? departmentId, [FromQuery] string? roleType)
    {
        var query = _db.Employees.Include(e => e.Department).Include(e => e.OrgDepartment).Include(e => e.LocationRef).Include(e => e.Shift).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(e => e.FullName.ToLower().Contains(search.ToLower())
                                   || e.EmpCode.ToLower().Contains(search.ToLower()));
        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(e => e.Type == type);
        if (departmentId.HasValue)
            query = query.Where(e => e.DepartmentId == departmentId);
        if (!string.IsNullOrWhiteSpace(roleType))
            query = query.Where(e => e.RoleType == roleType);

        var result = await query
            .OrderByDescending(e => e.DateOfJoining)
            .Select(e => new EmployeeListItem(
                e.EmployeeId, e.EmpCode, e.FullName, e.Designation,
                e.Department != null ? e.Department.DepartmentName : null,
                e.Type, e.Status, e.LocationRef != null ? e.LocationRef.LocationName : null,
                e.RoleType, e.ShiftId, e.Shift != null ? e.Shift.ShiftName : null,
                e.PasswordHash != null,
                e.OrgDepartment != null ? e.OrgDepartment.DepartmentName : null,
                _db.ApprovalRequests.Any(r => r.Status == "PENDING" && r.RequestType == "EMPLOYEE_DELETE" && r.TargetEmployeeId == e.EmployeeId)))
            .ToListAsync();

        return Ok(result);
    }

    // GET /api/employees/5  (full record incl. sub-pages)
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Employee>> GetById(int id)
    {
        var emp = await _db.Employees
            .Include(e => e.Department).Include(e => e.OrgDepartment).Include(e => e.Company).Include(e => e.LocationRef).Include(e => e.Manager).Include(e => e.Shift)
            .Include(e => e.BankDetail)
            .Include(e => e.ProofDocuments)
            .Include(e => e.Addresses)
            .Include(e => e.Education)
            .Include(e => e.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(e => e.EmployeeId == id);

        if (emp == null) return NotFound();
        return Ok(emp);
    }

    // POST /api/employees
    // Adding an employee is a request: nothing is created until an Admin or
    // SuperAdmin approves it on the Approvals screen. The request is checked now
    // (so the requester sees mistakes immediately) and again on approval.
    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Create(EmployeeUpsertRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required." });
        if (string.IsNullOrWhiteSpace(req.EmpCode))
            return BadRequest(new { message = "Employee ID is required." });
        if (await _db.Employees.AnyAsync(e => e.EmpCode == req.EmpCode))
            return Conflict(new { message = $"Employee ID '{req.EmpCode}' is already in use — pick a different one." });
        if (await _db.ApprovalRequests.AnyAsync(r => r.Status == "PENDING" && r.RequestType == "EMPLOYEE_ADD" && r.SummaryCode == req.EmpCode))
            return Conflict(new { message = $"A request to add Employee ID '{req.EmpCode}' is already waiting for approval." });

        var roleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!;
        if (RoleRank.TryGetValue(roleType, out var newRoleRank) && newRoleRank > CallerRoleRank())
            return StatusCode(403, new { message = $"You don't have permission to create a {roleType} account." });

        var loginError = ValidateLoginRequirements(roleType, req.Password, req.Email, hasExistingLogin: false);
        if (loginError != null) return BadRequest(new { message = loginError });

        if (LoginRoles.Contains(roleType) && await _db.Employees.AnyAsync(e => e.Email == req.Email && e.PasswordHash != null))
            return Conflict(new { message = "An account with this email already exists." });

        // The plain password must never be stored — keep only its hash in the request.
        var hash = LoginRoles.Contains(roleType) ? BCrypt.Net.BCrypt.HashPassword(req.Password!) : null;
        var payload = new PendingEmployeePayload(req with { Password = null, RoleType = roleType }, hash);

        var request = new ApprovalRequest
        {
            RequestType = "EMPLOYEE_ADD",
            SummaryCode = req.EmpCode,
            SummaryName = req.FullName,
            Payload = JsonSerializer.Serialize(payload),
            RequestedByEmployeeId = CallerId()
        };
        _db.ApprovalRequests.Add(request);
        await _db.SaveChangesAsync();

        return Accepted(new { approvalRequestId = request.ApprovalRequestId, pendingApproval = true,
            message = $"{req.FullName} has been sent for approval and will be added once an Admin or SuperAdmin approves it." });
    }

    // PUT /api/employees/5
    [HttpPut("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, EmployeeUpsertRequest req)
    {
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeId == id);
        if (emp == null) return NotFound();

        var callerRank = CallerRoleRank();
        if (RoleRank.TryGetValue(emp.RoleType, out var currentRoleRank) && currentRoleRank > callerRank)
            return StatusCode(403, new { message = "You don't have permission to edit this employee." });

        var roleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!;
        if (RoleRank.TryGetValue(roleType, out var newRoleRank) && newRoleRank > callerRank)
            return StatusCode(403, new { message = $"You don't have permission to assign the {roleType} role." });

        var hasExistingLogin = emp.PasswordHash != null;
        var loginError = ValidateLoginRequirements(roleType, req.Password, req.Email, hasExistingLogin);
        if (loginError != null) return BadRequest(new { message = loginError });

        if (LoginRoles.Contains(roleType) && !hasExistingLogin
            && await _db.Employees.AnyAsync(e => e.Email == req.Email && e.PasswordHash != null && e.EmployeeId != id))
            return Conflict(new { message = "An account with this email already exists." });

        // Marking someone as leaving deactivates them, so it has to go through the same
        // approval as Delete — it can't be done by typing a leaving date into this form.
        if (req.DateOfLeaving.HasValue && emp.DateOfLeaving == null)
            return BadRequest(new { message = "Deactivating an employee needs approval — use Delete on the Employees list, and set the leaving details here afterwards." });

        var roleChanged = emp.RoleType != roleType;

        emp.Type = req.Type;
        emp.FullName = req.FullName;
        emp.Designation = req.Designation;
        emp.DepartmentId = req.DepartmentId;
        emp.OrgDepartmentId = req.OrgDepartmentId;
        emp.CompanyId = req.CompanyId;
        emp.ManagerId = req.ManagerId;
        emp.ShiftId = req.ShiftId;
        emp.RoleType = roleType;
        emp.DateOfJoining = req.DateOfJoining;
        emp.DateOfBirth = req.DateOfBirth;
        emp.DateOfLeaving = req.DateOfLeaving;
        emp.LeavingComments = req.LeavingComments;
        emp.LocationId = req.LocationId;
        emp.Email = req.Email;
        emp.PhoneNumber = req.PhoneNumber;
        emp.PhotoUrl = req.PhotoUrl;
        emp.MaritalStatus = req.MaritalStatus;
        emp.Status = req.DateOfLeaving.HasValue ? "Inactive" : "Active";
        emp.UpdatedAt = DateTime.UtcNow;

        if (LoginRoles.Contains(roleType))
        {
            if (!hasExistingLogin)
            {
                // Elevating a plain "User" employee to a login-capable role for the first time.
                emp.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password!);
                emp.JwtToken = _jwt.GenerateToken(emp);
            }
            else
            {
                // Already has a login — only touch the password if one was actually
                // provided (blank = keep existing password). No forced change either
                // way — whatever password is set here (new or reset) is the one they
                // keep using going forward.
                if (!string.IsNullOrWhiteSpace(req.Password))
                {
                    emp.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
                }
                if (roleChanged)
                {
                    // Role is embedded in the JWT itself — an old token would keep
                    // claiming the previous role until a fresh one is issued.
                    emp.JwtToken = _jwt.GenerateToken(emp);
                }
            }
        }
        // Demoted back to plain "User": nothing to clean up. Login itself already
        // rejects RoleType == "User" regardless of whether password_hash is still
        // set, and if they're re-promoted later that dormant hash lets them skip
        // re-entering a password — same behavior as before, just no separate
        // "deactivated" flag needed.

        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static string? ValidateLoginRequirements(string roleType, string? password, string? email, bool hasExistingLogin) =>
        EmployeeRules.ValidateLoginRequirements(roleType, password, email, hasExistingLogin);

    // DELETE /api/employees/5 — deactivation REQUEST (needs Admin/SuperAdmin approval; the record is kept).
    // ?hard=true is a real delete, SuperAdmin only, immediate, and not exposed in the UI.
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id, [FromQuery] bool hard = false)
    {
        var emp = await _db.Employees.FindAsync(id);
        if (emp == null) return NotFound();

        if (RoleRank.TryGetValue(emp.RoleType, out var currentRoleRank) && currentRoleRank > CallerRoleRank())
            return StatusCode(403, new { message = "You don't have permission to deactivate this employee." });

        if (hard)
        {
            if (!User.IsInRole("SuperAdmin"))
                return Forbid();
            _db.Employees.Remove(emp);
        }
        else
        {
            // Deactivating is a request too: the employee stays Active until approved.
            if (emp.Status == "Inactive")
                return BadRequest(new { message = $"{emp.FullName} is already inactive." });
            if (await _db.ApprovalRequests.AnyAsync(r => r.Status == "PENDING" && r.RequestType == "EMPLOYEE_DELETE" && r.TargetEmployeeId == id))
                return Conflict(new { message = $"A request to deactivate {emp.FullName} is already waiting for approval." });

            var request = new ApprovalRequest
            {
                RequestType = "EMPLOYEE_DELETE",
                TargetEmployeeId = id,
                SummaryCode = emp.EmpCode,
                SummaryName = emp.FullName,
                RequestedByEmployeeId = CallerId()
            };
            _db.ApprovalRequests.Add(request);
            await _db.SaveChangesAsync();
            return Accepted(new { approvalRequestId = request.ApprovalRequestId, pendingApproval = true,
                message = $"Deactivating {emp.FullName} has been sent for approval." });
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PUT /api/employees/5/reactivate — undo a soft delete. Sets Status back
    // to Active and clears the leaving date; leaving comments are kept as a
    // historical note rather than erased.
    [HttpPut("{id:int}/reactivate")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Reactivate(int id)
    {
        var emp = await _db.Employees.FindAsync(id);
        if (emp == null) return NotFound();

        if (RoleRank.TryGetValue(emp.RoleType, out var currentRoleRank) && currentRoleRank > CallerRoleRank())
            return StatusCode(403, new { message = "You don't have permission to reactivate this employee." });

        emp.Status = "Active";
        emp.DateOfLeaving = null;
        emp.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    private int? CallerId()
    {
        var v = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(v, out var id) ? id : null;
    }

    private int CallerRoleRank()
    {
        var role = User.FindFirstValue(ClaimTypes.Role) ?? "User";
        return RoleRank.TryGetValue(role, out var rank) ? rank : 0;
    }
}
