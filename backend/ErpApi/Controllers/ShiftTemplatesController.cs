using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/shifts")]
[Authorize]
public class ShiftsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ShiftsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await _db.ShiftTemplates.OrderBy(s => s.ShiftName).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Create(ShiftTemplateRequest req)
    {
        var validation = Validate(req);
        if (validation != null) return validation;
        if (await _db.ShiftTemplates.AnyAsync(s => s.ShiftCode == req.ShiftCode.Trim()))
            return Conflict(new { message = "Shift code already exists." });

        var shift = Map(new ShiftTemplate(), req);
        _db.ShiftTemplates.Add(shift);
        await _db.SaveChangesAsync();
        return Ok(shift);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, ShiftTemplateRequest req)
    {
        var shift = await _db.ShiftTemplates.FindAsync(id);
        if (shift == null) return NotFound();
        var validation = Validate(req);
        if (validation != null) return validation;
        if (await _db.ShiftTemplates.AnyAsync(s => s.ShiftCode == req.ShiftCode.Trim() && s.ShiftId != id))
            return Conflict(new { message = "Shift code already exists." });

        Map(shift, req);
        await _db.SaveChangesAsync();
        return Ok(shift);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        var shift = await _db.ShiftTemplates.FindAsync(id);
        if (shift == null) return NotFound();
        if (await _db.Employees.AnyAsync(e => e.ShiftId == id) ||
            await _db.AttendanceEntries.AnyAsync(a => a.ShiftId == id))
            return Conflict(new { message = "This shift is in use and cannot be deleted. Mark it Inactive instead." });

        _db.ShiftTemplates.Remove(shift);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ActionResult? Validate(ShiftTemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ShiftCode) || string.IsNullOrWhiteSpace(req.ShiftName))
            return new BadRequestObjectResult(new { message = "Shift code and shift name are required." });
        if (req.FullDayMinutes <= 0 || req.MinimumWorkMinutes < 0 || req.HalfDayMinutes < 0)
            return new BadRequestObjectResult(new { message = "Work-minute thresholds must be valid." });
        if (req.OtStartAfterMinutes < 0)
            return new BadRequestObjectResult(new { message = "OT start-after minutes cannot be negative." });
        return null;
    }

    private static ShiftTemplate Map(ShiftTemplate s, ShiftTemplateRequest r)
    {
        s.ShiftCode = r.ShiftCode.Trim();
        s.ShiftName = r.ShiftName.Trim();
        s.StartTime = r.StartTime;
        s.EndTime = r.EndTime;
        s.LunchStartTime = r.LunchStartTime;
        s.LunchEndTime = r.LunchEndTime;
        s.GraceInMinutes = r.GraceInMinutes;
        s.GraceOutMinutes = r.GraceOutMinutes;
        s.LateAfterMinutes = r.LateAfterMinutes;
        s.EarlyOutMinutes = r.EarlyOutMinutes;
        s.MinimumWorkMinutes = r.MinimumWorkMinutes;
        s.HalfDayMinutes = r.HalfDayMinutes;
        s.FullDayMinutes = r.FullDayMinutes;
        s.OtAllowed = r.OtAllowed;
        s.OtStartAfterMinutes = r.OtStartAfterMinutes;
        s.IsNightShift = r.IsNightShift;
        s.Status = r.Status;
        return s;
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
