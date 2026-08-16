using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/employees/{employeeId:int}/bank-details")]
[Authorize]
public class BankDetailsController : ControllerBase
{
    private readonly AppDbContext _db;
    public BankDetailsController(AppDbContext db) => _db = db;

    // Bank/PAN/ESI numbers are sensitive — restricted to HR and above, not every logged-in role.
    [HttpGet]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<BankDetail>> Get(int employeeId)
    {
        var bd = await _db.BankDetails.FirstOrDefaultAsync(b => b.EmployeeId == employeeId);
        return bd == null ? NotFound() : Ok(bd);
    }

    // Upsert — one bank record per employee
    [HttpPut]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<BankDetail>> Upsert(int employeeId, BankDetailRequest req)
    {
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == employeeId)) return NotFound("Employee not found.");

        var bd = await _db.BankDetails.FirstOrDefaultAsync(b => b.EmployeeId == employeeId);
        if (bd == null)
        {
            bd = new BankDetail { EmployeeId = employeeId };
            _db.BankDetails.Add(bd);
        }
        bd.BankName = req.BankName;
        bd.AccountNumber = req.AccountNumber;
        bd.IfscCode = req.IfscCode;
        bd.BranchName = req.BranchName;
        bd.EsiNumber = req.EsiNumber;
        bd.PanNumber = req.PanNumber;

        await _db.SaveChangesAsync();
        return Ok(bd);
    }
}
