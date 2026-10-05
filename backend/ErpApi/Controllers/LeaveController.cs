using System.Security.Claims;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// Balances are derived, never stored: entitlement comes from the leave policy
// (leave_types), and this controller only records what was taken or manually
// adjusted. See LeaveRules for the arithmetic.
[ApiController]
[Route("api/leave")]
[Authorize(Roles = "HR,Admin,SuperAdmin")]
public class LeaveController : ControllerBase
{
    private readonly AppDbContext _db;
    public LeaveController(AppDbContext db) => _db = db;

    [HttpGet("types")]
    public async Task<IActionResult> Types() =>
        Ok(await _db.LeaveTypes.OrderBy(t => t.LeaveTypeId).ToListAsync());

    // GET /api/leave/balances?employeeId=5&month=2026-10
    // Each leave type's balance for the period containing that month
    // (Sick -> the whole calendar year, Casual/Permission -> that month).
    [HttpGet("balances")]
    public async Task<IActionResult> Balances([FromQuery] int employeeId, [FromQuery] string? month)
    {
        var emp = await _db.Employees.FindAsync(employeeId);
        if (emp == null) return NotFound();
        if (!TryReferenceDate(month, out var reference)) return BadRequest(new { message = "month must look like 2026-10." });

        var result = new List<LeaveBalanceItem>();
        foreach (var t in await _db.LeaveTypes.OrderBy(t => t.LeaveTypeId).ToListAsync())
            result.Add(await BalanceFor(emp, t, reference));
        return Ok(result);
    }

    // GET /api/leave/entries?employeeId=5&year=2026 — history for the year, newest first.
    [HttpGet("entries")]
    public async Task<IActionResult> Entries([FromQuery] int employeeId, [FromQuery] int? year)
    {
        var y = year ?? DateTime.Today.Year;
        var from = new DateOnly(y, 1, 1);
        var to = new DateOnly(y, 12, 31);
        var rows = await _db.LeaveEntries
            .Where(x => x.EmployeeId == employeeId && x.LeaveDate >= from && x.LeaveDate <= to)
            .OrderByDescending(x => x.LeaveDate).ThenByDescending(x => x.LeaveEntryId)
            .Select(x => new { x.LeaveEntryId, x.LeaveTypeId, TypeName = x.LeaveType!.Name, x.LeaveType.Unit, x.Kind, x.LeaveDate, x.Amount, x.Reason, x.CreatedByEmployeeId, x.CreatedAt })
            .ToListAsync();

        var creatorIds = rows.Where(r => r.CreatedByEmployeeId.HasValue).Select(r => r.CreatedByEmployeeId!.Value).Distinct().ToList();
        var names = await _db.Employees.Where(e => creatorIds.Contains(e.EmployeeId)).ToDictionaryAsync(e => e.EmployeeId, e => e.FullName);

        return Ok(rows.Select(r => new LeaveEntryItem(
            r.LeaveEntryId, r.LeaveTypeId, r.TypeName, r.Unit, r.Kind, r.LeaveDate, r.Amount, r.Reason,
            r.CreatedByEmployeeId.HasValue && names.TryGetValue(r.CreatedByEmployeeId.Value, out var n) ? n : null,
            r.CreatedAt)));
    }

    // POST /api/leave/entries — record leave taken.
    [HttpPost("entries")]
    public async Task<IActionResult> Take(LeaveEntryRequest req)
    {
        var emp = await _db.Employees.FindAsync(req.EmployeeId);
        if (emp == null) return BadRequest(new { message = "Employee not found." });
        if (emp.Status != "Active") return BadRequest(new { message = "Leave can only be recorded for an Active employee." });
        var type = await _db.LeaveTypes.FindAsync(req.LeaveTypeId);
        if (type == null) return BadRequest(new { message = "Leave type not found." });

        var balance = await BalanceFor(emp, type, req.LeaveDate);

        // Full-day leave types share a one-day-per-date cap, so a double click or a
        // sick day stacked on a casual day can't take more than one day off one date.
        decimal daysAlready = 0m;
        if (type.Unit == "DAYS")
        {
            var sameDay = await _db.LeaveEntries
                .Where(x => x.EmployeeId == emp.EmployeeId && x.LeaveDate == req.LeaveDate && x.Kind == "TAKEN" && x.LeaveType!.Unit == "DAYS")
                .Select(x => x.Amount)
                .ToListAsync();
            daysAlready = sameDay.Sum();
        }

        var error = LeaveRules.ValidateTaken(type, req.Amount, balance.Remaining, daysAlready, req.LeaveDate, emp.DateOfJoining, balance.PeriodLabel);
        if (error != null) return BadRequest(new { message = error });

        _db.LeaveEntries.Add(new LeaveEntry
        {
            EmployeeId = emp.EmployeeId, LeaveTypeId = type.LeaveTypeId, Kind = "TAKEN", LeaveDate = req.LeaveDate,
            Amount = req.Amount, Reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim(),
            CreatedByEmployeeId = CallerId()
        });
        await _db.SaveChangesAsync();
        return Ok(await BalanceFor(emp, type, req.LeaveDate));
    }

    // POST /api/leave/adjustments — exceptions only (an extra day granted, a mistake corrected).
    [HttpPost("adjustments")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Adjust(LeaveAdjustmentRequest req)
    {
        var emp = await _db.Employees.FindAsync(req.EmployeeId);
        if (emp == null) return BadRequest(new { message = "Employee not found." });
        var type = await _db.LeaveTypes.FindAsync(req.LeaveTypeId);
        if (type == null) return BadRequest(new { message = "Leave type not found." });

        var balance = await BalanceFor(emp, type, req.EffectiveDate);
        var error = LeaveRules.ValidateAdjustment(type, req.Amount, balance.Remaining, req.Reason, balance.PeriodLabel);
        if (error != null) return BadRequest(new { message = error });

        _db.LeaveEntries.Add(new LeaveEntry
        {
            EmployeeId = emp.EmployeeId, LeaveTypeId = type.LeaveTypeId, Kind = "ADJUST", LeaveDate = req.EffectiveDate,
            Amount = req.Amount, Reason = req.Reason.Trim(), CreatedByEmployeeId = CallerId()
        });
        await _db.SaveChangesAsync();
        return Ok(await BalanceFor(emp, type, req.EffectiveDate));
    }

    // DELETE /api/leave/entries/5 — undo a recording. Restores the balance.
    [HttpDelete("entries/{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entry = await _db.LeaveEntries.FindAsync(id);
        if (entry == null) return NotFound();

        if (entry.Kind == "ADJUST")
        {
            if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
                return StatusCode(403, new { message = "Only an Admin or SuperAdmin can remove a balance adjustment." });

            // Removing extra balance that has already been spent would leave the balance negative.
            if (entry.Amount > 0)
            {
                var emp = await _db.Employees.FindAsync(entry.EmployeeId);
                var type = await _db.LeaveTypes.FindAsync(entry.LeaveTypeId);
                if (emp != null && type != null)
                {
                    var balance = await BalanceFor(emp, type, entry.LeaveDate);
                    if (balance.Remaining - entry.Amount < 0)
                        return Conflict(new { message = "Part of this extra balance has already been used, so the adjustment can't be removed." });
                }
            }
        }

        _db.LeaveEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<LeaveBalanceItem> BalanceFor(Employee emp, LeaveType t, DateOnly reference)
    {
        var (start, end, label) = LeaveRules.PeriodFor(t.Period, reference);
        var entitlement = LeaveRules.Entitlement(t, emp.DateOfJoining, emp.DateOfLeaving, start, end);

        var rows = await _db.LeaveEntries
            .Where(x => x.EmployeeId == emp.EmployeeId && x.LeaveTypeId == t.LeaveTypeId && x.LeaveDate >= start && x.LeaveDate <= end)
            .Select(x => new { x.Kind, x.Amount })
            .ToListAsync();
        var taken = rows.Where(r => r.Kind == "TAKEN").Sum(r => r.Amount);
        var adjusted = rows.Where(r => r.Kind == "ADJUST").Sum(r => r.Amount);

        return new LeaveBalanceItem(
            t.LeaveTypeId, t.Code, t.Name, t.Unit, t.Period, label,
            entitlement, adjusted, taken, LeaveRules.Remaining(entitlement, adjusted, taken), t.Step);
    }

    private static bool TryReferenceDate(string? month, out DateOnly date)
    {
        if (string.IsNullOrWhiteSpace(month)) { date = DateOnly.FromDateTime(DateTime.Today); return true; }
        return DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out date);
    }

    private int? CallerId()
    {
        var v = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(v, out var id) ? id : null;
    }
}
