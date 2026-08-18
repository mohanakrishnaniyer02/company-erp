using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/departments")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public DepartmentsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await _db.Departments.OrderBy(d => d.DepartmentName).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Create(DepartmentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.DepartmentName))
            return BadRequest(new { message = "Department name is required." });
        if (req.RequiredWorkMinutes <= 0)
            return BadRequest(new { message = "Required work hours must be greater than zero." });
        if (req.OtAllowed && req.MinOtMinutes is null)
            return BadRequest(new { message = "Minimum OT time is required when OT is enabled." });
        if (req.OtAllowed && req.MaxOtMinutes is null)
            return BadRequest(new { message = "Maximum OT time is required when OT is enabled." });
        if (req.OtAllowed && req.MinOtMinutes.HasValue && req.MaxOtMinutes.HasValue && req.MinOtMinutes.Value > req.MaxOtMinutes.Value)
            return BadRequest(new { message = "Minimum OT time cannot exceed maximum OT time." });
        if (await _db.Departments.AnyAsync(d => d.DepartmentName == req.DepartmentName.Trim()))
            return Conflict(new { message = "Department already exists." });

        var d = new Department
        {
            DepartmentName = req.DepartmentName.Trim(),
            OtAllowed = req.OtAllowed,
            MinOtMinutes = req.OtAllowed ? req.MinOtMinutes : null,
            MaxOtMinutes = req.OtAllowed ? req.MaxOtMinutes : null,
            RequiredWorkMinutes = req.RequiredWorkMinutes
        };
        _db.Departments.Add(d);
        await _db.SaveChangesAsync();
        return Ok(d);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, DepartmentRequest req)
    {
        var d = await _db.Departments.FindAsync(id);
        if (d == null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.DepartmentName))
            return BadRequest(new { message = "Department name is required." });
        if (req.RequiredWorkMinutes <= 0)
            return BadRequest(new { message = "Required work hours must be greater than zero." });
        if (req.OtAllowed && (req.MinOtMinutes is null || req.MaxOtMinutes is null))
            return BadRequest(new { message = "Minimum and maximum OT are required when OT is enabled." });
        if (req.OtAllowed && req.MinOtMinutes.HasValue && req.MaxOtMinutes.HasValue && req.MinOtMinutes.Value > req.MaxOtMinutes.Value)
            return BadRequest(new { message = "Minimum OT time cannot exceed maximum OT time." });
        if (await _db.Departments.AnyAsync(x => x.DepartmentName == req.DepartmentName.Trim() && x.DepartmentId != id))
            return Conflict(new { message = "Department already exists." });

        d.DepartmentName = req.DepartmentName.Trim();
        d.OtAllowed = req.OtAllowed;
        d.MinOtMinutes = req.OtAllowed ? req.MinOtMinutes : null;
        d.MaxOtMinutes = req.OtAllowed ? req.MaxOtMinutes : null;
        d.RequiredWorkMinutes = req.RequiredWorkMinutes;
        await _db.SaveChangesAsync();
        return Ok(d);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        var d = await _db.Departments.FindAsync(id);
        if (d == null) return NotFound();
        if (await _db.Employees.AnyAsync(e => e.DepartmentId == id))
            return Conflict(new { message = "This department is assigned to employees and cannot be deleted. Edit or reassign those employees first." });
        _db.Departments.Remove(d);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
