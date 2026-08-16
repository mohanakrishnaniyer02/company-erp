using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/employees/{employeeId:int}/proof")]
[Authorize]
public class ProofController : ControllerBase
{
    private readonly AppDbContext _db;
    public ProofController(AppDbContext db) => _db = db;

    // Aadhaar/PAN/Passport numbers are sensitive — restricted to HR and above, not every logged-in role.
    [HttpGet]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<IEnumerable<ProofDocument>>> GetAll(int employeeId) =>
        Ok(await _db.ProofDocuments.Where(p => p.EmployeeId == employeeId).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<ActionResult<ProofDocument>> Add(int employeeId, ProofRequest req)
    {
        if (!await _db.Employees.AnyAsync(e => e.EmployeeId == employeeId)) return NotFound("Employee not found.");
        var proof = new ProofDocument
        {
            EmployeeId = employeeId,
            ProofType = req.ProofType,
            ProofNumber = req.ProofNumber,
            AttachmentUrl = req.AttachmentUrl
        };
        _db.ProofDocuments.Add(proof);
        await _db.SaveChangesAsync();
        return Ok(proof);
    }

    [HttpDelete("{proofId:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int employeeId, int proofId)
    {
        var proof = await _db.ProofDocuments.FirstOrDefaultAsync(p => p.ProofId == proofId && p.EmployeeId == employeeId);
        if (proof == null) return NotFound();
        _db.ProofDocuments.Remove(proof);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
