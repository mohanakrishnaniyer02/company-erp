using System.Security.Claims;
using System.Text.Json;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// The Approvals screens. Only Admin and SuperAdmin can see or use any of this.
//   Employees — requests to add or deactivate an employee (nothing happens until approved)
//   Overtime  — attendance entries whose OT is waiting for a decision
// An approver may decide on a request they raised themselves.
[ApiController]
[Route("api/approvals")]
[Authorize(Roles = "Admin,SuperAdmin")]
public class ApprovalsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    public ApprovalsController(AppDbContext db, IJwtService jwt) { _db = db; _jwt = jwt; }

    // GET /api/approvals/summary — counts for the sidebar badges.
    [HttpGet("summary")]
    public async Task<ActionResult<ApprovalSummary>> Summary()
    {
        var employees = await _db.ApprovalRequests.CountAsync(r => r.Status == "PENDING");
        var overtime = await _db.AttendanceEntries.CountAsync(a => a.OtStatus == "PENDING");
        return Ok(new ApprovalSummary(employees, overtime));
    }

    // ---------------------------------------------------------------- employees

    // GET /api/approvals/employees?status=PENDING|APPROVED|REJECTED|ALL
    [HttpGet("employees")]
    public async Task<ActionResult<IEnumerable<EmployeeApprovalItem>>> Employees([FromQuery] string? status)
    {
        var q = _db.ApprovalRequests.AsQueryable();
        var wanted = string.IsNullOrWhiteSpace(status) ? "PENDING" : status.ToUpperInvariant();
        if (wanted != "ALL") q = q.Where(r => r.Status == wanted);
        var requests = await q.OrderByDescending(r => r.RequestedAt).ToListAsync();

        var payrollDepts = await _db.Departments.ToDictionaryAsync(d => d.DepartmentId, d => d.DepartmentName);
        var orgDepts = await _db.OrgDepartments.ToDictionaryAsync(d => d.OrgDepartmentId, d => d.DepartmentName);
        var companies = await _db.Companies.ToDictionaryAsync(c => c.CompanyId, c => c.CompanyName);
        var shifts = await _db.ShiftTemplates.ToDictionaryAsync(s => s.ShiftId, s => s.ShiftName);
        var locations = await _db.Locations.ToDictionaryAsync(l => l.LocationId, l => l.LocationName);

        var personIds = requests.SelectMany(r => new[] { r.RequestedByEmployeeId, r.DecidedByEmployeeId })
            .Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        var targetIds = requests.Where(r => r.TargetEmployeeId.HasValue).Select(r => r.TargetEmployeeId!.Value).Distinct().ToList();
        var people = await _db.Employees.Where(e => personIds.Contains(e.EmployeeId)).ToDictionaryAsync(e => e.EmployeeId, e => e.FullName);
        var targets = await _db.Employees.Where(e => targetIds.Contains(e.EmployeeId)).ToDictionaryAsync(e => e.EmployeeId);

        string? Lookup(Dictionary<int, string> d, int? id) => id.HasValue && d.TryGetValue(id.Value, out var v) ? v : null;
        string? Person(int? id) => id.HasValue && people.TryGetValue(id.Value, out var v) ? v : null;

        var items = new List<EmployeeApprovalItem>();
        foreach (var r in requests)
        {
            if (r.RequestType == "EMPLOYEE_ADD")
            {
                var p = JsonSerializer.Deserialize<PendingEmployeePayload>(r.Payload);
                if (p == null) continue;
                var e = p.Employee;
                items.Add(new EmployeeApprovalItem(
                    r.ApprovalRequestId, r.RequestType, r.Status,
                    e.EmpCode, e.FullName, e.Designation, e.Type, e.RoleType ?? "User",
                    Lookup(payrollDepts, e.DepartmentId), Lookup(orgDepts, e.OrgDepartmentId), Lookup(companies, e.CompanyId),
                    Lookup(shifts, e.ShiftId), Lookup(locations, e.LocationId),
                    e.DateOfJoining, e.Email, e.PhoneNumber, p.PasswordHash != null,
                    Person(r.RequestedByEmployeeId), r.RequestedAt, Person(r.DecidedByEmployeeId), r.DecidedAt, r.DecisionNote));
            }
            else
            {
                targets.TryGetValue(r.TargetEmployeeId ?? 0, out var t);
                items.Add(new EmployeeApprovalItem(
                    r.ApprovalRequestId, r.RequestType, r.Status,
                    r.SummaryCode ?? t?.EmpCode ?? "", r.SummaryName, t?.Designation, t?.Type, t?.RoleType,
                    Lookup(payrollDepts, t?.DepartmentId), Lookup(orgDepts, t?.OrgDepartmentId), Lookup(companies, t?.CompanyId),
                    Lookup(shifts, t?.ShiftId), Lookup(locations, t?.LocationId),
                    t?.DateOfJoining, t?.Email, t?.PhoneNumber, t?.PasswordHash != null,
                    Person(r.RequestedByEmployeeId), r.RequestedAt, Person(r.DecidedByEmployeeId), r.DecidedAt, r.DecisionNote));
            }
        }
        return Ok(items);
    }

    [HttpPost("employees/{id:int}/approve")]
    public async Task<IActionResult> ApproveEmployee(int id)
    {
        var request = await _db.ApprovalRequests.FindAsync(id);
        if (request == null) return NotFound();
        if (request.Status != "PENDING") return Conflict(new { message = "This request has already been decided." });
        var approverRole = User.FindFirstValue(ClaimTypes.Role);

        if (request.RequestType == "EMPLOYEE_ADD")
        {
            var payload = JsonSerializer.Deserialize<PendingEmployeePayload>(request.Payload);
            if (payload == null) return BadRequest(new { message = "This request is unreadable." });

            // Same hierarchy as everywhere else: you can't approve creating someone above your own level.
            var roleType = payload.Employee.RoleType ?? "User";
            if (!EmployeeRules.CanManage(approverRole, roleType))
                return StatusCode(403, new { message = $"Only a {roleType} or higher can approve adding a {roleType}." });

            await using var tx = await _db.Database.BeginTransactionAsync();
            var (employee, error) = await EmployeeProvisioner.CreateAsync(_db, _jwt, payload.Employee, payload.PasswordHash);
            if (error != null) return Conflict(new { message = error + " Reject this request and ask for a corrected one." });

            request.TargetEmployeeId = employee!.EmployeeId;
            Decide(request, "APPROVED", null);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return Ok(new { message = $"{employee.FullName} was added." });
        }

        var target = request.TargetEmployeeId.HasValue ? await _db.Employees.FindAsync(request.TargetEmployeeId.Value) : null;
        if (target == null) return Conflict(new { message = "This employee no longer exists. Reject the request." });
        if (!EmployeeRules.CanManage(approverRole, target.RoleType))
            return StatusCode(403, new { message = $"Only a {target.RoleType} or higher can approve deactivating a {target.RoleType}." });

        target.Status = "Inactive";
        target.DateOfLeaving ??= DateOnly.FromDateTime(DateTime.UtcNow);
        target.UpdatedAt = DateTime.UtcNow;
        Decide(request, "APPROVED", null);
        await _db.SaveChangesAsync();
        return Ok(new { message = $"{target.FullName} was deactivated." });
    }

    [HttpPost("employees/{id:int}/reject")]
    public async Task<IActionResult> RejectEmployee(int id, DecisionRequest req)
    {
        var request = await _db.ApprovalRequests.FindAsync(id);
        if (request == null) return NotFound();
        if (request.Status != "PENDING") return Conflict(new { message = "This request has already been decided." });
        Decide(request, "REJECTED", req.Note);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Request rejected." });
    }

    // ----------------------------------------------------------------- overtime

    // GET /api/approvals/overtime?month=2026-10&status=PENDING|APPROVED|REJECTED|ALL
    // Pending ignores the month — the queue should show everything still waiting.
    [HttpGet("overtime")]
    public async Task<ActionResult<IEnumerable<OvertimeApprovalItem>>> Overtime([FromQuery] string? month, [FromQuery] string? status)
    {
        var wanted = string.IsNullOrWhiteSpace(status) ? "PENDING" : status.ToUpperInvariant();
        var q = _db.AttendanceEntries.Where(a => a.OtStatus != "NONE");
        if (wanted != "ALL") q = q.Where(a => a.OtStatus == wanted);
        if (wanted != "PENDING" && !string.IsNullOrWhiteSpace(month)
            && DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out var first))
        {
            var last = first.AddMonths(1).AddDays(-1);
            q = q.Where(a => a.AttendanceDate >= first && a.AttendanceDate <= last);
        }

        var rows = await q
            .OrderBy(a => a.AttendanceDate).ThenBy(a => a.Employee!.FullName)
            .Select(a => new
            {
                a.AttendanceId, a.AttendanceDate, a.EmployeeId, EmployeeName = a.Employee!.FullName, a.Employee.EmpCode,
                ShiftName = a.Shift!.ShiftName, a.ActualWorkMinutes, a.RequiredWorkMinutes, a.CalculatedOtMinutes,
                a.RoundedOtMinutes, a.ApprovedOtMinutes, a.OtStatus, a.OtDecidedByEmployeeId, a.OtDecidedAt, a.Reason
            })
            .ToListAsync();

        var ids = rows.Select(r => r.AttendanceId).ToList();
        var punches = await _db.AttendancePunches.Where(p => ids.Contains(p.AttendanceId)).ToListAsync();
        var deciderIds = rows.Where(r => r.OtDecidedByEmployeeId.HasValue).Select(r => r.OtDecidedByEmployeeId!.Value).Distinct().ToList();
        var deciders = await _db.Employees.Where(e => deciderIds.Contains(e.EmployeeId)).ToDictionaryAsync(e => e.EmployeeId, e => e.FullName);

        var items = rows.Select(r =>
        {
            var ordered = punches.Where(p => p.AttendanceId == r.AttendanceId).OrderBy(p => p.SequenceNo).ToList();
            return new OvertimeApprovalItem(
                r.AttendanceId, r.AttendanceDate, r.EmployeeId, r.EmployeeName, r.EmpCode, r.ShiftName,
                ordered.FirstOrDefault()?.PunchIn, ordered.LastOrDefault()?.PunchOut,
                r.ActualWorkMinutes, r.RequiredWorkMinutes, r.CalculatedOtMinutes, r.RoundedOtMinutes, r.ApprovedOtMinutes,
                r.OtStatus,
                r.OtDecidedByEmployeeId.HasValue && deciders.TryGetValue(r.OtDecidedByEmployeeId.Value, out var n) ? n : null,
                r.OtDecidedAt, r.Reason);
        }).ToList();
        return Ok(items);
    }

    // POST /api/approvals/overtime/12/approve   { approvedMinutes?, note? }
    // The approver can change the minutes (up to what was actually worked as OT);
    // leaving them out approves the rounded figure as calculated.
    [HttpPost("overtime/{attendanceId:int}/approve")]
    public async Task<IActionResult> ApproveOvertime(int attendanceId, OtDecisionRequest req)
    {
        var a = await _db.AttendanceEntries.FindAsync(attendanceId);
        if (a == null) return NotFound();
        if (a.OtStatus != "PENDING") return Conflict(new { message = "This overtime isn't waiting for approval." });

        var approved = req.ApprovedMinutes ?? a.RoundedOtMinutes;
        var error = OvertimeRules.ValidateApproval(a.CalculatedOtMinutes, a.RoundedOtMinutes, approved, req.Note);
        if (error != null) return BadRequest(new { message = error });

        a.OtStatus = "APPROVED";
        a.ApprovedOtMinutes = approved;
        a.CountedWorkMinutes = OvertimeRules.CountedWorkMinutes(a.ActualWorkMinutes, a.RequiredWorkMinutes, "APPROVED", approved);
        a.Reason = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        a.OtDecidedByEmployeeId = CallerId();
        a.OtDecidedAt = DateTime.UtcNow;
        a.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Overtime approved." });
    }

    // POST /api/approvals/overtime/12/reject   { note? } — the OT time is skipped; the day counts without it.
    [HttpPost("overtime/{attendanceId:int}/reject")]
    public async Task<IActionResult> RejectOvertime(int attendanceId, DecisionRequest req)
    {
        var a = await _db.AttendanceEntries.FindAsync(attendanceId);
        if (a == null) return NotFound();
        if (a.OtStatus != "PENDING") return Conflict(new { message = "This overtime isn't waiting for approval." });

        a.OtStatus = "REJECTED";
        a.ApprovedOtMinutes = 0;
        a.CountedWorkMinutes = OvertimeRules.CountedWorkMinutes(a.ActualWorkMinutes, a.RequiredWorkMinutes, "REJECTED", 0);
        a.Reason = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        a.OtDecidedByEmployeeId = CallerId();
        a.OtDecidedAt = DateTime.UtcNow;
        a.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Overtime rejected." });
    }

    private void Decide(ApprovalRequest r, string status, string? note)
    {
        r.Status = status;
        r.DecidedByEmployeeId = CallerId();
        r.DecidedAt = DateTime.UtcNow;
        r.DecisionNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
    }

    private int? CallerId()
    {
        var v = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(v, out var id) ? id : null;
    }
}
