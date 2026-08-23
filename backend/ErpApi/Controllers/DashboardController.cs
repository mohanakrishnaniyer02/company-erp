using ErpApi.Data;
using ErpApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    public DashboardController(AppDbContext db) => _db = db;

    [HttpGet("stats")]
    public async Task<ActionResult<DashboardStats>> Stats()
    {
        var employees = await _db.Employees
            .Include(e => e.Department).Include(e => e.LocationRef).Include(e => e.Shift)
            .ToListAsync();

        var total = employees.Count;
        var active = employees.Count(e => e.Status == "Active");
        var contract = employees.Count(e => e.Type == "Contract");

        var byDept = employees
            .Where(e => e.Department != null)
            .GroupBy(e => e.Department!.DepartmentName)
            .Select(g => new DeptCount(g.Key, g.Count()))
            .OrderByDescending(d => d.Count)
            .ToList();

        var byRole = employees
            .GroupBy(e => e.RoleType)
            .Select(g => new RoleCount(g.Key, g.Count()))
            .OrderByDescending(r => r.Count)
            .ToList();

        var byShift = employees
            .Where(e => e.Shift != null)
            .GroupBy(e => e.Shift!.ShiftName)
            .Select(g => new ShiftCount(g.Key, g.Count()))
            .OrderByDescending(s => s.Count)
            .ToList();

        var unassignedShiftCount = employees.Count(e => e.ShiftId == null && e.Status == "Active");

        var recent = employees
            .OrderByDescending(e => e.DateOfJoining)
            .Take(4)
            .Select(e => new EmployeeListItem(
                e.EmployeeId, e.EmpCode, e.FullName, e.Designation,
                e.Department?.DepartmentName, e.Type, e.Status, e.LocationRef?.LocationName,
                e.RoleType, e.ShiftId, e.Shift?.ShiftName, e.PasswordHash != null))
            .ToList();

        var today = DateOnly.FromDateTime(DateTime.Now);
        var attendance = await _db.AttendanceEntries
            .Include(a => a.AttendanceStatus)
            .Where(a => a.AttendanceDate == today)
            .ToListAsync();

        var todaySummary = new DashboardAttendance(
            today.ToString("yyyy-MM-dd"),
            attendance.Count(a => a.AttendanceStatus!.Status == "PRESENT"),
            attendance.Count(a => a.AttendanceStatus!.Status == "ABSENT"),
            attendance.Count(a => a.AttendanceStatus!.Status == "HALF_DAY"),
            attendance.Count(a => a.AttendanceStatus!.Status == "PAID_LEAVE"),
            attendance.Count(a => a.AttendanceStatus!.Status == "ON_DUTY"),
            attendance.Count(a => !new[] { "PRESENT", "ABSENT", "HALF_DAY", "PAID_LEAVE", "ON_DUTY" }.Contains(a.AttendanceStatus!.Status)),
            attendance.Count,
            attendance.Sum(a => a.ActualWorkMinutes),
            attendance.Sum(a => a.ApprovedOtMinutes));

        return Ok(new DashboardStats(total, active, contract, byDept, byRole, byShift, unassignedShiftCount, recent, todaySummary));
    }
}
