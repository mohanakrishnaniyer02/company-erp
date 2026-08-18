using ErpApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/lookups")]
[Authorize]
public class LookupsController : ControllerBase
{
    private readonly AppDbContext _db;
    public LookupsController(AppDbContext db) => _db = db;

    [HttpGet("companies")]
    public async Task<IActionResult> Companies() => Ok(await _db.Companies.ToListAsync());

    [HttpGet("departments")]
    public async Task<IActionResult> Departments() => Ok(await _db.Departments.ToListAsync());

    [HttpGet("locations")]
    public async Task<IActionResult> Locations() => Ok(await _db.Locations.ToListAsync());

    [HttpGet("shifts")]
    public async Task<IActionResult> Shifts() => Ok(await _db.ShiftTemplates
        .Where(s => s.Status == "Active")
        .OrderBy(s => s.ShiftName)
        .ToListAsync());
}
