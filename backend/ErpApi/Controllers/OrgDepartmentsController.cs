using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// The organisational "Department" list — just names. (Payroll Departments,
// which carry the OT policy and required hours, live in DepartmentsController.)
[ApiController]
[Route("api/org-departments")]
[Authorize]
public class OrgDepartmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public OrgDepartmentsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await _db.OrgDepartments.OrderBy(d => d.DepartmentName).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Create(OrgDepartmentRequest req)
    {
        var name = (req.DepartmentName ?? "").Trim();
        if (name.Length == 0) return BadRequest(new { message = "Department name is required." });
        if (await _db.OrgDepartments.AnyAsync(d => d.DepartmentName.ToLower() == name.ToLower()))
            return Conflict(new { message = "A department with this name already exists." });

        var d = new OrgDepartment { DepartmentName = name };
        _db.OrgDepartments.Add(d);
        await _db.SaveChangesAsync();
        return Ok(d);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, OrgDepartmentRequest req)
    {
        var d = await _db.OrgDepartments.FindAsync(id);
        if (d == null) return NotFound();
        var name = (req.DepartmentName ?? "").Trim();
        if (name.Length == 0) return BadRequest(new { message = "Department name is required." });
        if (await _db.OrgDepartments.AnyAsync(x => x.OrgDepartmentId != id && x.DepartmentName.ToLower() == name.ToLower()))
            return Conflict(new { message = "A department with this name already exists." });

        d.DepartmentName = name;
        await _db.SaveChangesAsync();
        return Ok(d);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        var d = await _db.OrgDepartments.FindAsync(id);
        if (d == null) return NotFound();
        if (await _db.Employees.AnyAsync(e => e.OrgDepartmentId == id))
            return Conflict(new { message = "Employees are assigned to this department, so it can't be deleted." });

        _db.OrgDepartments.Remove(d);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
