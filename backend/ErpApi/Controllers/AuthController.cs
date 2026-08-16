using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    private static readonly string[] ValidRoles = { "User", "HR", "Admin", "SuperAdmin" };
    private static readonly string[] SelfServiceRoles = { "User", "HR" };

    public AuthController(AppDbContext db, IJwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    // POST /api/auth/signup
    // Public, unauthenticated endpoint. Self-service signup is intentionally limited to
    // low-privilege roles (User, HR) — see CreateUser below for how Admin/SuperAdmin
    // accounts get created. The ONE exception: if the users table is completely empty
    // (fresh install), the very first signup may pick any role, so you can bootstrap
    // your own Admin/SuperAdmin account without needing direct DB access.
    [HttpPost("signup")]
    public async Task<ActionResult<AuthResponse>> Signup(SignupRequest req)
    {
        var validation = ValidateSignupInput(req);
        if (validation != null) return validation;

        var isFirstUserEver = !await _db.Users.AnyAsync();
        if (!isFirstUserEver && !SelfServiceRoles.Contains(req.Role))
        {
            return BadRequest(new
            {
                message = "Self-service signup is limited to the User or HR roles. " +
                           "Ask an existing Admin or SuperAdmin to create Admin/SuperAdmin accounts " +
                           "via POST /api/auth/create-user."
            });
        }

        if (await _db.Users.AnyAsync(u => u.Email == req.Email))
            return Conflict(new { message = "An account with this email already exists." });

        var user = new User
        {
            FullName = req.FullName,
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = _jwt.GenerateToken(user);
        user.JwtToken = token;
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(user.UserId, user.FullName, user.Email, user.Role, token));
    }

    // POST /api/auth/create-user
    // Admin/SuperAdmin only. This is the correct way to create HR/Admin/SuperAdmin
    // accounts after the initial bootstrap signup above.
    [HttpPost("create-user")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<AuthResponse>> CreateUser(SignupRequest req)
    {
        var validation = ValidateSignupInput(req);
        if (validation != null) return validation;

        if (await _db.Users.AnyAsync(u => u.Email == req.Email))
            return Conflict(new { message = "An account with this email already exists." });

        var user = new User
        {
            FullName = req.FullName,
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = _jwt.GenerateToken(user);
        user.JwtToken = token;
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(user.UserId, user.FullName, user.Email, user.Role, token));
    }

    // POST /api/auth/login
    // Per spec: no refresh-token flow. The token issued at signup is reused for every
    // subsequent login — we do NOT mint a new JWT on each login. Login only re-verifies
    // the password and hands back the token already stored against this user.
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email && u.IsActive);
        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password." });

        var token = user.JwtToken;
        if (string.IsNullOrEmpty(token))
        {
            // Only happens for accounts that never went through /signup (e.g. a row inserted
            // directly via SQL, like the seeded admin user) — issue one the first time, then
            // every login after this reuses it same as anyone else.
            token = _jwt.GenerateToken(user);
            user.JwtToken = token;
            await _db.SaveChangesAsync();
        }

        return Ok(new AuthResponse(user.UserId, user.FullName, user.Email, user.Role, token));
    }

    private ActionResult? ValidateSignupInput(SignupRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Full name, email and password are required." });

        if (!ValidRoles.Contains(req.Role))
            return BadRequest(new { message = "Role must be one of: User, HR, Admin, SuperAdmin." });

        if (req.Password.Length < 8 || !req.Password.Any(char.IsDigit) || !req.Password.Any(char.IsLetter))
            return BadRequest(new { message = "Password must be at least 8 characters and include both letters and numbers." });

        return null;
    }
}
