using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/shift-templates")]
[Authorize]
public class ShiftTemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    public ShiftTemplatesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ShiftTemplate>>> GetAll() =>
        Ok(await _db.ShiftTemplates.ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<ShiftTemplate>> Create(ShiftTemplateRequest req)
    {
        var shift = new ShiftTemplate
        {
            ShiftName = req.ShiftName, StartTime = req.StartTime, EndTime = req.EndTime, IsNextDay = req.IsNextDay,
            Break1Start = req.Break1Start, Break1End = req.Break1End,
            Break2Start = req.Break2Start, Break2End = req.Break2End,
            LunchStart = req.LunchStart, LunchEnd = req.LunchEnd
        };
        _db.ShiftTemplates.Add(shift);
        await _db.SaveChangesAsync();
        return Ok(shift);
    }
}

[ApiController]
[Route("api/employees/{employeeId:int}/shift-assignment")]
[Authorize]
public class ShiftAssignmentController : ControllerBase
{
    private readonly AppDbContext _db;
    public ShiftAssignmentController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<EmployeeShiftAssignment?>> GetCurrent(int employeeId) =>
        Ok(await _db.ShiftAssignments
            .Include(a => a.Shift)
            .Where(a => a.EmployeeId == employeeId)
            .OrderByDescending(a => a.EffectiveFrom)
            .FirstOrDefaultAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<EmployeeShiftAssignment>> Assign(int employeeId, AssignShiftRequest req)
    {
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == employeeId)) return NotFound("Employee not found.");
        var assignment = new EmployeeShiftAssignment
        {
            EmployeeId = employeeId, ShiftId = req.ShiftId, EffectiveFrom = req.EffectiveFrom
        };
        _db.ShiftAssignments.Add(assignment);
        await _db.SaveChangesAsync();
        return Ok(assignment);
    }
}
