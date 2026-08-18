using System.Security.Claims;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/attendance")]
[Authorize]
public class AttendanceController : ControllerBase
{
    private readonly AppDbContext _db;
    public AttendanceController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly? date, [FromQuery] int? employeeId)
    {
        var query = _db.AttendanceEntries
            .Include(a => a.Employee)
            .Include(a => a.Shift)
            .Include(a => a.AttendanceStatus)
            .AsQueryable();

        if (date.HasValue) query = query.Where(a => a.AttendanceDate == date.Value);
        if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId.Value);

        var result = await query
            .OrderByDescending(a => a.AttendanceDate)
            .ThenBy(a => a.Employee!.FullName)
            .Select(a => new AttendanceListItem(
                a.AttendanceId, a.EmployeeId, a.Employee!.FullName, a.Employee.EmpCode,
                a.AttendanceDate, a.ShiftId, a.Shift!.ShiftName,
                a.AttendanceStatus!.Status, a.AttendanceStatus.AttendanceUnits,
                a.EntryType, a.ActualWorkMinutes, a.RequiredWorkMinutes,
                a.CalculatedOtMinutes, a.RoundedOtMinutes, a.ApprovedOtMinutes))
            .ToListAsync();

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var entry = await _db.AttendanceEntries
            .Include(a => a.Employee).Include(a => a.Shift).Include(a => a.AttendanceStatus)
            .FirstOrDefaultAsync(a => a.AttendanceId == id);
        return entry == null ? NotFound() : Ok(entry);
    }

    [HttpGet("statuses")]
    public async Task<IActionResult> GetStatuses() =>
        Ok(await _db.AttendanceStatuses.Where(x => x.IsActive).OrderBy(x => x.AttendanceStatusId).ToListAsync());

    [HttpGet("rounding-rules")]
    public async Task<IActionResult> GetRoundingRules() =>
        Ok(await _db.OtRoundingRules.Where(x => x.IsActive).OrderBy(x => x.FromMinutes).ToListAsync());

    [HttpPost("calculate")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Calculate(AttendanceCalculationRequest req)
    {
        var calculation = await CalculateInternal(req);
        return calculation.Error != null
            ? BadRequest(new { message = calculation.Error })
            : Ok(calculation.Result);
    }

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Create(AttendanceUpsertRequest req)
    {
        var employee = await _db.Employees
            .Include(e => e.Department)
            .FirstOrDefaultAsync(e => e.EmployeeId == req.EmployeeId);
        if (employee == null) return NotFound(new { message = "Employee not found." });

        var existing = await _db.AttendanceEntries
            .FirstOrDefaultAsync(a => a.EmployeeId == req.EmployeeId && a.AttendanceDate == req.AttendanceDate);

        var requestForCalculation = new AttendanceCalculationRequest(
            req.EmployeeId, req.ShiftId,
            req.In1, req.Out1, req.In2, req.Out2, req.In3, req.Out3,
            req.In4, req.Out4, req.In5, req.Out5);

        var calculation = await CalculateInternal(requestForCalculation);
        if (calculation.Error != null) return BadRequest(new { message = calculation.Error });

        var result = calculation.Result!;
        var approved = req.ApprovedOtMinutes ?? result.RoundedOtMinutes;
        if (approved < 0) return BadRequest(new { message = "Approved OT cannot be negative." });
        if (approved != result.RoundedOtMinutes && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "Reason is required when approved OT differs from rounded OT." });

        if (existing == null)
        {
            existing = new AttendanceEntry
            {
                EmployeeId = req.EmployeeId,
                AttendanceDate = req.AttendanceDate,
                CreatedByUserId = GetUserId(),
                CreatedAt = DateTime.UtcNow
            };
            _db.AttendanceEntries.Add(existing);
        }

        existing.ShiftId = req.ShiftId;
        existing.AttendanceStatusId = req.AttendanceStatusId;
        existing.EntryType = req.EntryType;
        existing.In1 = req.In1; existing.Out1 = req.Out1;
        existing.In2 = req.In2; existing.Out2 = req.Out2;
        existing.In3 = req.In3; existing.Out3 = req.Out3;
        existing.In4 = req.In4; existing.Out4 = req.Out4;
        existing.In5 = req.In5; existing.Out5 = req.Out5;
        existing.ActualWorkMinutes = result.ActualWorkMinutes;
        existing.RequiredWorkMinutes = result.RequiredWorkMinutes;
        existing.CalculatedOtMinutes = result.CalculatedOtMinutes;
        existing.RoundedOtMinutes = result.RoundedOtMinutes;
        existing.ApprovedOtMinutes = approved;
        existing.Reason = req.Reason;
        existing.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(existing);
    }

    [HttpPost("statuses")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> CreateStatus(AttendanceStatusRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Status) || string.IsNullOrWhiteSpace(req.Meaning))
            return BadRequest(new { message = "Status and meaning are required." });
        if (await _db.AttendanceStatuses.AnyAsync(x => x.Status == req.Status.Trim()))
            return Conflict(new { message = "Attendance status already exists." });

        var status = new AttendanceStatus
        {
            Status = req.Status.Trim().ToUpperInvariant(),
            AttendanceUnits = req.AttendanceUnits,
            Meaning = req.Meaning.Trim(),
            IsActive = req.IsActive
        };
        _db.AttendanceStatuses.Add(status);
        await _db.SaveChangesAsync();
        return Ok(status);
    }

    [HttpPost("rounding-rules")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> CreateRoundingRule(OtRoundingRuleRequest req)
    {
        if (req.FromMinutes < 0 || req.ToMinutes < req.FromMinutes || req.RoundedMinutes < 0)
            return BadRequest(new { message = "Invalid rounding range." });

        var rule = new OtRoundingRule
        {
            FromMinutes = req.FromMinutes,
            ToMinutes = req.ToMinutes,
            RoundedMinutes = req.RoundedMinutes,
            IsActive = req.IsActive
        };
        _db.OtRoundingRules.Add(rule);
        await _db.SaveChangesAsync();
        return Ok(rule);
    }

    private async Task<(AttendanceCalculationResult? Result, string? Error)> CalculateInternal(AttendanceCalculationRequest req)
    {
        var employee = await _db.Employees.Include(e => e.Department).FirstOrDefaultAsync(e => e.EmployeeId == req.EmployeeId);
        if (employee == null) return (null, "Employee not found.");

        var shift = await _db.ShiftTemplates.FirstOrDefaultAsync(s => s.ShiftId == req.ShiftId);
        if (shift == null) return (null, "Shift not found.");

        var pairs = new[]
        {
            (req.In1, req.Out1), (req.In2, req.Out2), (req.In3, req.Out3),
            (req.In4, req.Out4), (req.In5, req.Out5)
        };

        var actual = 0;
        foreach (var (start, end) in pairs)
        {
            if (start.HasValue && !end.HasValue)
                return (null, "Every In punch must have a matching Out punch.");
            if (!start.HasValue && end.HasValue)
                return (null, "An Out punch cannot exist without its matching In punch.");
            if (start.HasValue && end.HasValue)
                actual += DurationMinutesExcludingLunch(start.Value, end.Value, shift.LunchStartTime, shift.LunchEndTime);
        }

        var required = employee.Department?.RequiredWorkMinutes ?? shift.FullDayMinutes;
        var rawOt = Math.Max(0, actual - required);
        var ot = rawOt;

        if (!employee.Department?.OtAllowed ?? false) ot = 0;
        if (!shift.OtAllowed) ot = 0;
        if (shift.OtAllowed && rawOt < shift.OtStartAfterMinutes) ot = 0;
        if (employee.Department?.MinOtMinutes is int minOt && ot > 0 && ot < minOt) ot = 0;
        if (employee.Department?.MaxOtMinutes is int maxOt) ot = Math.Min(ot, maxOt);

        var rounded = 0;
        if (ot > 0)
        {
            var rule = await _db.OtRoundingRules
                .Where(r => r.IsActive && r.FromMinutes <= ot && r.ToMinutes >= ot)
                .OrderByDescending(r => r.FromMinutes)
                .FirstOrDefaultAsync();

            rounded = rule?.RoundedMinutes ?? (ot / 30) * 30;
        }

        return (new AttendanceCalculationResult(actual, required, ot, rounded, rounded), null);
    }

    private static int DurationMinutesExcludingLunch(
        TimeOnly start, TimeOnly end, TimeOnly? lunchStart, TimeOnly? lunchEnd)
    {
        var s = start.Hour * 60 + start.Minute;
        var e = end.Hour * 60 + end.Minute;
        if (e < s) e += 24 * 60;

        var total = e - s;
        if (!lunchStart.HasValue || !lunchEnd.HasValue) return total;

        var ls = lunchStart.Value.Hour * 60 + lunchStart.Value.Minute;
        var le = lunchEnd.Value.Hour * 60 + lunchEnd.Value.Minute;

        while (ls < s) { ls += 24 * 60; le += 24 * 60; }
        if (le <= ls) le += 24 * 60;

        var overlapStart = Math.Max(s, ls);
        var overlapEnd = Math.Min(e, le);
        var lunchOverlap = Math.Max(0, overlapEnd - overlapStart);
        return Math.Max(0, total - lunchOverlap);
    }

    private int? GetUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(value, out var id) ? id : null;
    }
}
