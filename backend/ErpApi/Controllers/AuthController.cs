using System.Security.Claims;
using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// There is no public signup anymore. The database is seeded with exactly one
// working SuperAdmin account (see schema.sql / the bootstrap migration) — log
// in with that once, you're forced to set your own password immediately, and
// from there every further HR/Admin/SuperAdmin account is created through the
// Employee form (see EmployeesController), not here.
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
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email && u.IsActive);
        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password." });

        if (user.Role == "User")
            return StatusCode(403, new { message = "This account does not have application access. Contact an Admin to be granted HR, Admin, or SuperAdmin access." });

        var token = user.JwtToken;
        if (string.IsNullOrEmpty(token))
        {
            // Only happens for an account whose token somehow never got set —
            // issue one now, then every login after this reuses it same as anyone else.
            token = _jwt.GenerateToken(user);
            user.JwtToken = token;
            await _db.SaveChangesAsync();
        }

        return Ok(new AuthResponse(user.UserId, user.FullName, user.Email, user.Role, token, user.MustChangePassword));
    }

    // PUT /api/auth/change-password
    // Works for two situations: a mandatory first-login change (must_change_password
    // was true) and a voluntary change any time after that. Either way this does NOT
    // touch the JWT — the token doesn't encode the password, only identity and role,
    // so it stays valid and reused exactly as before.
    [HttpPut("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var user = await _db.Users.FindAsync(userId.Value);
        if (user == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Current password is incorrect." });

        if (req.NewPassword.Length < 8 || !req.NewPassword.Any(char.IsDigit) || !req.NewPassword.Any(char.IsLetter))
            return BadRequest(new { message = "New password must be at least 8 characters and include both letters and numbers." });

        if (BCrypt.Net.BCrypt.Verify(req.NewPassword, user.PasswordHash))
            return BadRequest(new { message = "New password must be different from your current password." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.MustChangePassword = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Password updated." });
    }

    private int? GetUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(value, out var id) ? id : null;
    }
}
