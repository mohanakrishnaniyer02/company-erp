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
        var employees = await _db.Employees.Include(e => e.Department).Include(e => e.LocationRef).ToListAsync();

        var total = employees.Count;
        var active = employees.Count(e => e.Status == "Active");
        var contract = employees.Count(e => e.Type == "Contract");

        var byDept = employees
            .Where(e => e.Department != null)
            .GroupBy(e => e.Department!.DepartmentName)
            .Select(g => new DeptCount(g.Key, g.Count()))
            .OrderByDescending(d => d.Count)
            .ToList();

        var recent = employees
            .OrderByDescending(e => e.DateOfJoining)
            .Take(4)
            .Select(e => new EmployeeListItem(
                e.EmployeeId, e.EmpCode, e.FullName, e.Designation,
                e.Department?.DepartmentName, e.Type, e.Status, e.LocationRef?.LocationName))
            .ToList();

        return Ok(new DashboardStats(total, active, contract, byDept, recent));
    }
}
