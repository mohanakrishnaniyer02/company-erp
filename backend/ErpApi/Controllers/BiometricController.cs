using ErpApi.Data;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ErpApi.Controllers;

// Fetches an employee's biometric captures for one day so the attendance form can fill itself in.
// Nothing is saved here: HR reviews the filled-in form and presses Save Attendance.
[ApiController]
[Route("api/biometric")]
[Authorize(Roles = "HR,Admin,SuperAdmin")]
public class BiometricController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IBiometricPunchSource _source;
    private readonly BiometricOptions _opts;
    public BiometricController(AppDbContext db, IBiometricPunchSource source, IOptions<BiometricOptions> opts)
    { _db = db; _source = source; _opts = opts.Value; }

    // GET /api/biometric/punches?employeeId=5&date=2026-10-09
    [HttpGet("punches")]
    public async Task<IActionResult> Punches([FromQuery] int employeeId, [FromQuery] DateOnly date)
    {
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.EmployeeId == employeeId);
        if (emp == null) return NotFound(new { message = "Employee not found." });
        if (string.IsNullOrWhiteSpace(emp.BiometricDeviceEmpId))
            return BadRequest(new { message = $"{emp.FullName} has no Biometric Device ID. Add it on the employee's profile (Work details) first." });

        List<DateTime> raw;
        try { raw = await _source.GetCaptureTimesAsync(emp.BiometricDeviceEmpId, date); }
        catch (Exception ex)
        {
            return StatusCode(502, new { message = $"Could not read the biometric data ({_source.Name}): {ex.Message}" });
        }

        var (kept, ignored) = BiometricPunchRules.Dedupe(raw, _opts.DuplicateWindowSeconds);
        var pairs = BiometricPunchRules.Pair(kept);
        return Ok(new
        {
            deviceEmpId = emp.BiometricDeviceEmpId,
            source = _source.Name,
            rawCount = raw.Count,
            duplicatesIgnored = ignored,
            duplicateWindowSeconds = _opts.DuplicateWindowSeconds,
            capturedTimes = kept.Select(t => t.ToString("HH:mm:ss")),
            punches = pairs,
            lastPunchHasNoOut = kept.Count % 2 == 1
        });
    }
}
