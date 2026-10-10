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
[Route("api/attendance")]
[Authorize]
public class AttendanceController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AttendanceRuleService _rules;
    public AttendanceController(AppDbContext db, AttendanceRuleService rules) { _db = db; _rules = rules; }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] DateOnly? date, [FromQuery] int? employeeId,
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate)
    {
        var query = _db.AttendanceEntries
            .Include(a => a.Employee)
            .Include(a => a.Shift)
            .Include(a => a.AttendanceStatus)
            .AsQueryable();

        if (date.HasValue) query = query.Where(a => a.AttendanceDate == date.Value);
        if (fromDate.HasValue) query = query.Where(a => a.AttendanceDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(a => a.AttendanceDate <= toDate.Value);
        if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId.Value);

        var result = await query
            .OrderByDescending(a => a.AttendanceDate)
            .ThenBy(a => a.Employee!.FullName)
            .Select(a => new AttendanceListItem(
                a.AttendanceId, a.EmployeeId, a.Employee!.FullName, a.Employee.EmpCode,
                a.AttendanceDate, a.ShiftId, a.Shift!.ShiftName,
                a.AttendanceStatus!.Status, a.AttendanceStatus.AttendanceUnits,
                a.EntryType, a.ActualWorkMinutes, a.RequiredWorkMinutes,
                a.CalculatedOtMinutes, a.RoundedOtMinutes, a.ApprovedOtMinutes,
                a.OtStatus, a.CountedWorkMinutes,
                a.Comments,
                a.Punches.OrderBy(p => p.SequenceNo).Select(p => new PunchPairDto(p.PunchIn, p.PunchOut)).ToList(),
                a.LateInMinutes, a.EarlyOutMinutes,
                _db.AttendanceRuleApplications.Any(r => r.AttendanceId == a.AttendanceId)))
            .ToListAsync();

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var entry = await _db.AttendanceEntries
            .Include(a => a.Employee).Include(a => a.Shift).Include(a => a.AttendanceStatus)
            .Include(a => a.Punches.OrderBy(p => p.SequenceNo))
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
            .Include(a => a.Punches)
            .FirstOrDefaultAsync(a => a.EmployeeId == req.EmployeeId && a.AttendanceDate == req.AttendanceDate);

        var requestForCalculation = new AttendanceCalculationRequest(req.EmployeeId, req.ShiftId, req.Punches);

        var calculation = await CalculateInternal(requestForCalculation);
        if (calculation.Error != null) return BadRequest(new { message = calculation.Error });

        var result = calculation.Result!;

        // OT no longer gets approved here: any OT above zero goes to the Approvals screen
        // as PENDING and counts for nothing until an Admin/SuperAdmin decides. An earlier
        // decision survives a re-save only if the OT itself didn't change.
        var (otStatus, approvedOt) = OvertimeRules.StatusOnSave(
            existing?.OtStatus, existing?.RoundedOtMinutes ?? 0, existing?.ApprovedOtMinutes ?? 0, result.RoundedOtMinutes);
        var decisionStands = existing != null && otStatus == existing.OtStatus && otStatus is "APPROVED" or "REJECTED";

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
        else
        {
            // Full replace of this day's punch rows — simplest correct semantics for a
            // "save the whole day's entry" form, same as the old fixed-column version
            // implicitly did by overwriting in1..out5 every save.
            _db.AttendancePunches.RemoveRange(existing.Punches);
        }

        existing.ShiftId = req.ShiftId;
        existing.AttendanceStatusId = req.AttendanceStatusId;
        existing.EntryType = req.EntryType;
        existing.Punches = (req.Punches ?? new List<PunchPairDto>())
            .Select((p, idx) => new AttendancePunch { SequenceNo = idx + 1, PunchIn = p.PunchIn, PunchOut = p.PunchOut })
            .ToList();
        existing.ActualWorkMinutes = result.ActualWorkMinutes;
        existing.RequiredWorkMinutes = result.RequiredWorkMinutes;
        existing.CalculatedOtMinutes = result.CalculatedOtMinutes;
        existing.RoundedOtMinutes = result.RoundedOtMinutes;
        existing.ApprovedOtMinutes = approvedOt;
        existing.OtStatus = otStatus;
        existing.CountedWorkMinutes = OvertimeRules.CountedWorkMinutes(result.ActualWorkMinutes, result.RequiredWorkMinutes, otStatus, approvedOt);
        if (!decisionStands)
        {
            // New or changed OT starts undecided; no stale approver/note left behind.
            existing.Reason = null;
            existing.OtDecidedByEmployeeId = null;
            existing.OtDecidedAt = null;
        }
        existing.Comments = req.Comments;
        existing.UpdatedAt = DateTime.UtcNow;

        // Lateness is always recorded; deductions only happen when HR ticked "Apply attendance rules".
        // Re-saving replaces whatever the rules did before on this entry, so unticking waives it.
        var shift = (await _db.ShiftTemplates.FindAsync(req.ShiftId))!;
        (existing.LateInMinutes, existing.EarlyOutMinutes) = AttendanceRuleService.Variance(shift, req.Punches);

        await using var tx = await _db.Database.BeginTransactionAsync();
        if (existing.AttendanceId != 0) await _rules.RevertAsync(existing.AttendanceId);
        await _db.SaveChangesAsync(); // gives a new entry its id and releases reverted deductions
        if (req.ApplyRules)
        {
            var evaluations = await _rules.EvaluateAsync(employee, shift, req.AttendanceDate, req.Punches, existing.AttendanceId);
            await _rules.ApplyAsync(existing, evaluations, GetUserId());
            await _db.SaveChangesAsync();
        }
        await tx.CommitAsync();
        return Ok(existing);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        var entry = await _db.AttendanceEntries.FindAsync(id);
        if (entry == null) return NotFound();
        await _rules.RevertAsync(id); // give back anything the attendance rules deducted for this day
        _db.AttendanceEntries.Remove(entry); // punches cascade-delete via the FK's ON DELETE CASCADE
        await _db.SaveChangesAsync();
        return NoContent();
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

    [HttpDelete("rounding-rules/{id:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> DeleteRoundingRule(int id)
    {
        var rule = await _db.OtRoundingRules.FindAsync(id);
        if (rule == null) return NotFound();
        _db.OtRoundingRules.Remove(rule);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<(AttendanceCalculationResult? Result, string? Error)> CalculateInternal(AttendanceCalculationRequest req)
    {
        var employee = await _db.Employees.Include(e => e.Department).FirstOrDefaultAsync(e => e.EmployeeId == req.EmployeeId);
        if (employee == null) return (null, "Employee not found.");

        var shift = await _db.ShiftTemplates.FirstOrDefaultAsync(s => s.ShiftId == req.ShiftId);
        if (shift == null) return (null, "Shift not found.");

        var actual = 0;
        var seq = 0;
        foreach (var p in req.Punches ?? new List<PunchPairDto>())
        {
            seq++;
            if (p.PunchIn.HasValue && !p.PunchOut.HasValue)
                return (null, $"Punch pair {seq}: an In time needs a matching Out time.");
            if (!p.PunchIn.HasValue && p.PunchOut.HasValue)
                return (null, $"Punch pair {seq}: an Out time needs a matching In time.");
            if (p.PunchIn.HasValue && p.PunchOut.HasValue)
                actual += DurationMinutesExcludingLunch(p.PunchIn.Value, p.PunchOut.Value, shift.LunchStartTime, shift.LunchEndTime);
        }

        var required = employee.Department?.RequiredWorkMinutes ?? shift.FullDayMinutes;
        var rawOt = Math.Max(0, actual - required);
        var ot = rawOt;

        // Whether OT is allowed at all comes from the Payroll Department's policy;
        // the shift only contributes its "OT starts after" threshold.
        if (!employee.Department?.OtAllowed ?? false) ot = 0;
        if (rawOt < shift.OtStartAfterMinutes) ot = 0;
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

        return (new AttendanceCalculationResult(actual, required, ot, rounded), null);
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
