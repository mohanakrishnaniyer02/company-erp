using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
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
    public EmployeesController(AppDbContext db) => _db = db;

    // GET /api/employees?search=&type=&departmentId=
    [HttpGet]
    public async Task<ActionResult<IEnumerable<EmployeeListItem>>> GetAll(
        [FromQuery] string? search, [FromQuery] string? type, [FromQuery] int? departmentId)
    {
        var query = _db.Employees.Include(e => e.Department).Include(e => e.LocationRef).Include(e => e.Shift).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(e => e.FullName.ToLower().Contains(search.ToLower())
                                   || e.EmpCode.ToLower().Contains(search.ToLower()));
        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(e => e.Type == type);
        if (departmentId.HasValue)
            query = query.Where(e => e.DepartmentId == departmentId);

        var result = await query
            .OrderByDescending(e => e.DateOfJoining)
            .Select(e => new EmployeeListItem(
                e.EmployeeId, e.EmpCode, e.FullName, e.Designation,
                e.Department != null ? e.Department.DepartmentName : null,
                e.Type, e.Status, e.LocationRef != null ? e.LocationRef.LocationName : null,
                e.RoleType, e.ShiftId, e.Shift != null ? e.Shift.ShiftName : null))
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
            RoleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!,
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
        _db.Employees.Add(emp);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = emp.EmployeeId }, emp);
    }

    // PUT /api/employees/5
    [HttpPut("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, EmployeeUpsertRequest req)
    {
        var emp = await _db.Employees.FindAsync(id);
        if (emp == null) return NotFound();

        emp.Type = req.Type;
        emp.FullName = req.FullName;
        emp.Designation = req.Designation;
        emp.DepartmentId = req.DepartmentId;
        emp.CompanyId = req.CompanyId;
        emp.ManagerId = req.ManagerId;
        emp.ShiftId = req.ShiftId;
        emp.RoleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!;
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

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/employees/5 — soft delete (HR record retention). Use ?hard=true for a real delete (SuperAdmin only).
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id, [FromQuery] bool hard = false)
    {
        var emp = await _db.Employees.FindAsync(id);
        if (emp == null) return NotFound();

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
}
