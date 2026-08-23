using System.Security.Claims;
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
    private static readonly string[] LoginRoles = { "HR", "Admin", "SuperAdmin" };

    // SuperAdmin can manage anyone. Admin can manage Admin/HR/User (not SuperAdmin).
    // HR can manage HR/User (not Admin/SuperAdmin). Applies to both who they can
    // create/edit AND which role they're allowed to assign.
    private static readonly Dictionary<string, int> RoleRank = new()
    {
        { "User", 0 }, { "HR", 1 }, { "Admin", 2 }, { "SuperAdmin", 3 }
    };

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
        var query = _db.Employees.Include(e => e.Department).Include(e => e.LocationRef).Include(e => e.Shift).AsQueryable();

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
                e.PasswordHash != null))
            .ToListAsync();

        return Ok(result);
    }

    // GET /api/employees/5  (full record incl. sub-pages)
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Employee>> GetById(int id)
    {
        var emp = await _db.Employees
            .Include(e => e.Department).Include(e => e.Company).Include(e => e.LocationRef).Include(e => e.Manager).Include(e => e.Shift)
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
    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<Employee>> Create(EmployeeUpsertRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required." });
        if (string.IsNullOrWhiteSpace(req.EmpCode))
            return BadRequest(new { message = "Employee ID is required." });
        if (await _db.Employees.AnyAsync(e => e.EmpCode == req.EmpCode))
            return Conflict(new { message = $"Employee ID '{req.EmpCode}' is already in use — pick a different one." });

        var roleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!;
        if (RoleRank.TryGetValue(roleType, out var newRoleRank) && newRoleRank > CallerRoleRank())
            return StatusCode(403, new { message = $"You don't have permission to create a {roleType} account." });

        var loginError = ValidateLoginRequirements(roleType, req.Password, req.Email, hasExistingLogin: false);
        if (loginError != null) return BadRequest(new { message = loginError });

        if (LoginRoles.Contains(roleType) && await _db.Employees.AnyAsync(e => e.Email == req.Email && e.PasswordHash != null))
            return Conflict(new { message = "An account with this email already exists." });

        var emp = new Employee
        {
            EmpCode = req.EmpCode,
            Type = req.Type,
            FullName = req.FullName,
            Designation = req.Designation,
            DepartmentId = req.DepartmentId,
            CompanyId = req.CompanyId,
            ManagerId = req.ManagerId,
            ShiftId = req.ShiftId,
            RoleType = roleType,
            DateOfJoining = req.DateOfJoining,
            DateOfBirth = req.DateOfBirth,
            DateOfLeaving = req.DateOfLeaving,
            LeavingComments = req.LeavingComments,
            LocationId = req.LocationId,
            Email = req.Email,
            PhoneNumber = req.PhoneNumber,
            PhotoUrl = req.PhotoUrl,
            MaritalStatus = req.MaritalStatus,
            Status = req.DateOfLeaving.HasValue ? "Inactive" : "Active"
        };

        if (LoginRoles.Contains(roleType))
        {
            emp.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password!);
            emp.MustChangePassword = true; // admin-assigned password — they set their own on first login
        }

        _db.Employees.Add(emp);
        await _db.SaveChangesAsync(); // need emp.EmployeeId before the token can embed it

        if (LoginRoles.Contains(roleType))
        {
            emp.JwtToken = _jwt.GenerateToken(emp);
            await _db.SaveChangesAsync();
        }

        return CreatedAtAction(nameof(GetById), new { id = emp.EmployeeId }, emp);
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

        var roleChanged = emp.RoleType != roleType;

        emp.Type = req.Type;
        emp.FullName = req.FullName;
        emp.Designation = req.Designation;
        emp.DepartmentId = req.DepartmentId;
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
                emp.MustChangePassword = true; // admin-assigned password — they set their own on first login
                emp.JwtToken = _jwt.GenerateToken(emp);
            }
            else
            {
                // Already has a login — only touch the password if one was actually
                // provided (blank = keep existing password).
                if (!string.IsNullOrWhiteSpace(req.Password))
                {
                    emp.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
                    emp.MustChangePassword = true; // admin reset it — they set their own again on next login
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

    private static string? ValidateLoginRequirements(string roleType, string? password, string? email, bool hasExistingLogin)
    {
        if (!LoginRoles.Contains(roleType)) return null;
        if (string.IsNullOrWhiteSpace(email))
            return "Email is required to grant HR/Admin/SuperAdmin access.";
        if (!hasExistingLogin && string.IsNullOrWhiteSpace(password))
            return "A password is required to grant HR/Admin/SuperAdmin access.";
        if (!string.IsNullOrWhiteSpace(password) &&
            (password.Length < 8 || !password.Any(char.IsDigit) || !password.Any(char.IsLetter)))
            return "Password must be at least 8 characters and include both letters and numbers.";
        return null;
    }

    // DELETE /api/employees/5 — soft delete (HR record retention). Use ?hard=true for a real delete (SuperAdmin only).
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
            emp.Status = "Inactive";
            emp.DateOfLeaving ??= DateOnly.FromDateTime(DateTime.UtcNow);
            emp.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    private int CallerRoleRank()
    {
        var role = User.FindFirstValue(ClaimTypes.Role) ?? "User";
        return RoleRank.TryGetValue(role, out var rank) ? rank : 0;
    }
}
