using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// Date-ranged shift overrides for individual employees, plus the two things
// that depend on them: resolving "which shift is this person on today?" for
// the attendance screen, and the month calendar of shift headcounts.
[ApiController]
[Route("api/shift-mappings")]
[Authorize(Roles = "HR,Admin,SuperAdmin")]
public class ShiftMappingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ShiftMappingsController(AppDbContext db) => _db = db;

    // GET /api/shift-mappings?employeeId=&fromDate=&toDate=
    // With a date range, returns mappings that overlap it.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ShiftMappingItem>>> GetAll(
        [FromQuery] int? employeeId, [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate)
    {
        var q = _db.ShiftMappings.AsQueryable();
        if (employeeId.HasValue) q = q.Where(m => m.EmployeeId == employeeId.Value);
        if (fromDate.HasValue) q = q.Where(m => m.EndDate >= fromDate.Value);
        if (toDate.HasValue) q = q.Where(m => m.StartDate <= toDate.Value);

        var result = await q
            .OrderByDescending(m => m.StartDate).ThenBy(m => m.Employee!.FullName)
            .Select(m => new ShiftMappingItem(
                m.ShiftMappingId, m.EmployeeId, m.Employee!.FullName, m.Employee.EmpCode,
                m.ShiftId, m.Shift!.ShiftName, m.Shift.ShiftCode, m.StartDate, m.EndDate))
            .ToListAsync();
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create(ShiftMappingRequest req)
    {
        var error = await Validate(req, null);
        if (error != null) return error;

        var m = new ShiftMapping { EmployeeId = req.EmployeeId, ShiftId = req.ShiftId, StartDate = req.StartDate, EndDate = req.EndDate };
        _db.ShiftMappings.Add(m);
        await _db.SaveChangesAsync();
        return Ok(new { m.ShiftMappingId });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ShiftMappingRequest req)
    {
        var m = await _db.ShiftMappings.FindAsync(id);
        if (m == null) return NotFound();
        var error = await Validate(req, id);
        if (error != null) return error;

        m.EmployeeId = req.EmployeeId; m.ShiftId = req.ShiftId; m.StartDate = req.StartDate; m.EndDate = req.EndDate;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var m = await _db.ShiftMappings.FindAsync(id);
        if (m == null) return NotFound();
        _db.ShiftMappings.Remove(m);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/shift-mappings/resolve?employeeId=5&date=2026-10-07
    // A mapping covering that date wins; otherwise the employee's own (first
    // allocated) shift; otherwise nothing.
    [HttpGet("resolve")]
    public async Task<ActionResult<ResolvedShift>> Resolve([FromQuery] int employeeId, [FromQuery] DateOnly date)
    {
        var mapped = await _db.ShiftMappings
            .Where(m => m.EmployeeId == employeeId && m.StartDate <= date && m.EndDate >= date)
            .Select(m => new ResolvedShift(m.ShiftId, m.Shift!.ShiftName, "Mapped"))
            .FirstOrDefaultAsync();
        if (mapped != null) return Ok(mapped);

        var own = await _db.Employees
            .Where(e => e.EmployeeId == employeeId && e.ShiftId != null)
            .Select(e => new ResolvedShift(e.ShiftId, e.Shift!.ShiftName, "Default"))
            .FirstOrDefaultAsync();
        return Ok(own ?? new ResolvedShift(null, null, "None"));
    }

    // GET /api/shift-mappings/calendar?month=2026-10&orgDepartmentId=
    // For every day of the month: which shift each employee is on (mapping if
    // one covers the day, else their default shift), grouped by shift.
    [HttpGet("calendar")]
    public async Task<IActionResult> Calendar([FromQuery] string month, [FromQuery] int? orgDepartmentId)
    {
        if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out var first))
            return BadRequest(new { message = "month must look like 2026-10." });
        var last = first.AddMonths(1).AddDays(-1);

        var empQuery = _db.Employees.AsQueryable();
        if (orgDepartmentId.HasValue) empQuery = empQuery.Where(e => e.OrgDepartmentId == orgDepartmentId);
        var employees = await empQuery
            .Where(e => e.DateOfLeaving == null || e.DateOfLeaving >= first)
            .Where(e => e.DateOfJoining == null || e.DateOfJoining <= last)
            .Where(e => e.Status == "Active" || e.DateOfLeaving != null)
            .Select(e => new { e.EmployeeId, e.FullName, e.EmpCode, e.ShiftId, e.DateOfJoining, e.DateOfLeaving })
            .ToListAsync();

        var empIds = employees.Select(e => e.EmployeeId).ToList();
        var mappings = await _db.ShiftMappings
            .Where(m => empIds.Contains(m.EmployeeId) && m.EndDate >= first && m.StartDate <= last)
            .ToListAsync();
        var shifts = await _db.ShiftTemplates.ToDictionaryAsync(s => s.ShiftId);

        var days = new List<object>();
        for (var d = first; d <= last; d = d.AddDays(1))
        {
            var groups = new Dictionary<int, List<object>>(); // key 0 = no shift assigned
            foreach (var e in employees)
            {
                if (e.DateOfJoining.HasValue && e.DateOfJoining.Value > d) continue;
                if (e.DateOfLeaving.HasValue && e.DateOfLeaving.Value < d) continue;

                var map = mappings.FirstOrDefault(m => m.EmployeeId == e.EmployeeId && m.StartDate <= d && m.EndDate >= d);
                var shiftId = map?.ShiftId ?? e.ShiftId ?? 0;
                if (!groups.TryGetValue(shiftId, out var list)) groups[shiftId] = list = new List<object>();
                list.Add(new { e.EmployeeId, e.FullName, e.EmpCode, mapped = map != null });
            }

            days.Add(new
            {
                date = d.ToString("yyyy-MM-dd"),
                shifts = groups.OrderBy(g => g.Key).Select(g => new
                {
                    shiftId = g.Key == 0 ? (int?)null : g.Key,
                    shiftName = g.Key == 0 ? "No shift assigned" : (shifts.TryGetValue(g.Key, out var s) ? s.ShiftName : "Unknown"),
                    shiftCode = g.Key == 0 ? "" : (shifts.TryGetValue(g.Key, out var s2) ? s2.ShiftCode : ""),
                    isNightShift = g.Key != 0 && shifts.TryGetValue(g.Key, out var s3) && s3.IsNightShift,
                    count = g.Value.Count,
                    employees = g.Value
                }).ToList()
            });
        }
        return Ok(new { month, days });
    }

    private async Task<IActionResult?> Validate(ShiftMappingRequest req, int? selfId)
    {
        if (req.EndDate < req.StartDate)
            return BadRequest(new { message = "End date can't be before the start date." });
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == req.EmployeeId))
            return BadRequest(new { message = "Employee not found." });
        var shift = await _db.ShiftTemplates.FindAsync(req.ShiftId);
        if (shift == null) return BadRequest(new { message = "Shift not found." });
        if (shift.Status != "Active") return BadRequest(new { message = "That shift is Inactive." });

        var overlapping = _db.ShiftMappings
            .Where(m => m.EmployeeId == req.EmployeeId && m.StartDate <= req.EndDate && m.EndDate >= req.StartDate);
        if (selfId.HasValue) overlapping = overlapping.Where(m => m.ShiftMappingId != selfId.Value);
        var clash = await overlapping
            .Select(m => new { m.StartDate, m.EndDate, m.Shift!.ShiftName })
            .FirstOrDefaultAsync();
        if (clash != null)
            return Conflict(new { message = $"This overlaps an existing mapping ({clash.ShiftName}, {clash.StartDate:yyyy-MM-dd} to {clash.EndDate:yyyy-MM-dd}) for the same employee." });
        return null;
    }
}
