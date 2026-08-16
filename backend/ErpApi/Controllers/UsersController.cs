using ErpApi.Data;
using ErpApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// Admin/SuperAdmin only — lets an admin see everyone with access to the system.
// Creating a new user still goes through POST /api/auth/create-user (also Admin/SuperAdmin only).
[ApiController]
[Route("api/users")]
[Authorize(Roles = "Admin,SuperAdmin")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    public UsersController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserListItem>>> GetAll() =>
        Ok(await _db.Users
            .OrderBy(u => u.FullName)
            .Select(u => new UserListItem(u.UserId, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt))
            .ToListAsync());
}
