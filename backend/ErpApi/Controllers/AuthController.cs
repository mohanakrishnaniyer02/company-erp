using System.Security.Claims;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// There is no public signup. The database is seeded with exactly one working
// SuperAdmin employee (see schema.sql / the bootstrap migration) — log in
// with that once, you're forced to set your own password immediately, and
// from there every further HR/Admin/SuperAdmin account is created through
// the Employee form (see EmployeesController), not here.
//
// Login credentials live directly on the employees table now — there's no
// separate users table to join against.
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;

    public AuthController(AppDbContext db, IJwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    // POST /api/auth/login
    // Per spec: no refresh-token flow. The token issued when the account was created
    // (via the Employee form, or this seed) is reused for every subsequent login —
    // we do NOT mint a new JWT just because someone logged in again.
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Email == req.Email && e.PasswordHash != null);
        if (emp == null || !BCrypt.Net.BCrypt.Verify(req.Password, emp.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password." });

        if (emp.Status != "Active")
            return StatusCode(403, new { message = "This account is inactive. Contact an Admin." });

        if (emp.RoleType == "User")
            return StatusCode(403, new { message = "This account does not have application access. Contact an Admin to be granted HR, Admin, or SuperAdmin access." });

        var token = emp.JwtToken;
        if (string.IsNullOrEmpty(token))
        {
            // Only happens if a token somehow never got set — issue one now,
            // then every login after this reuses it same as anyone else.
            token = _jwt.GenerateToken(emp);
            emp.JwtToken = token;
            await _db.SaveChangesAsync();
        }

        return Ok(new AuthResponse(emp.EmployeeId, emp.FullName, emp.Email!, emp.RoleType, token, emp.MustChangePassword));
    }

    // PUT /api/auth/change-password
    // Works for both a mandatory first-login change (must_change_password was
    // true) and a voluntary change any time after that. This does NOT touch
    // the JWT — the token doesn't encode the password, only identity and
    // role, so it stays valid and reused exactly as before.
    [HttpPut("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var employeeId = GetEmployeeId();
        if (employeeId == null) return Unauthorized();

        var emp = await _db.Employees.FindAsync(employeeId.Value);
        if (emp == null || emp.PasswordHash == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, emp.PasswordHash))
            return BadRequest(new { message = "Current password is incorrect." });

        if (req.NewPassword.Length < 8 || !req.NewPassword.Any(char.IsDigit) || !req.NewPassword.Any(char.IsLetter))
            return BadRequest(new { message = "New password must be at least 8 characters and include both letters and numbers." });

        if (BCrypt.Net.BCrypt.Verify(req.NewPassword, emp.PasswordHash))
            return BadRequest(new { message = "New password must be different from your current password." });

        emp.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        emp.MustChangePassword = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Password updated." });
    }

    private int? GetEmployeeId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(value, out var id) ? id : null;
    }
}
