namespace ErpApi.DTOs;

public record SignupRequest(string FullName, string Email, string Password, string Role);
public record LoginRequest(string Email, string Password);
public record AuthResponse(int UserId, string FullName, string Email, string Role, string Token);
public record UserListItem(int UserId, string FullName, string Email, string Role, bool IsActive, DateTime CreatedAt);
