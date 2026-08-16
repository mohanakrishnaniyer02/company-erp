using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/employees/{employeeId:int}/education")]
[Authorize]
public class EducationController : ControllerBase
{
    private readonly AppDbContext _db;
    public EducationController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<EmployeeEducation>>> GetAll(int employeeId) =>
        Ok(await _db.EmployeeEducations.Where(e => e.EmployeeId == employeeId).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<EmployeeEducation>> Add(int employeeId, EducationRequest req)
    {
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == employeeId)) return NotFound("Employee not found.");
        var edu = new EmployeeEducation
        {
            EmployeeId = employeeId,
            InstitutionName = req.InstitutionName,
            Degree = req.Degree,
            CompletionDate = req.CompletionDate
        };
        _db.EmployeeEducations.Add(edu);
        await _db.SaveChangesAsync();
        return Ok(edu);
    }

    [HttpDelete("{educationId:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int employeeId, int educationId)
    {
        var edu = await _db.EmployeeEducations.FirstOrDefaultAsync(e => e.EducationId == educationId && e.EmployeeId == employeeId);
        if (edu == null) return NotFound();
        _db.EmployeeEducations.Remove(edu);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
