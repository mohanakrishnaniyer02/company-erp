using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/employees/{employeeId:int}/addresses")]
[Authorize]
public class AddressController : ControllerBase
{
    private readonly AppDbContext _db;
    public AddressController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<EmployeeAddress>>> GetAll(int employeeId) =>
        Ok(await _db.EmployeeAddresses.Where(a => a.EmployeeId == employeeId).ToListAsync());

    // Upsert by address type (Current / Permanent)
    [HttpPut("{addressType}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<EmployeeAddress>> Upsert(int employeeId, string addressType, AddressRequest req)
    {
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == employeeId)) return NotFound("Employee not found.");

        var addr = await _db.EmployeeAddresses
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.AddressType == addressType);
        if (addr == null)
        {
            addr = new EmployeeAddress { EmployeeId = employeeId, AddressType = addressType };
            _db.EmployeeAddresses.Add(addr);
        }
        addr.AddressLine1 = req.AddressLine1;
        addr.AddressLine2 = req.AddressLine2;
        addr.AddressLine3 = req.AddressLine3;
        addr.EmergencyPerson = req.EmergencyPerson;
        addr.EmergencyContactNumber = req.EmergencyContactNumber;

        await _db.SaveChangesAsync();
        return Ok(addr);
    }
}
