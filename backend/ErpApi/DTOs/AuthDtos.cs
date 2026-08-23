namespace ErpApi.DTOs;

public record LoginRequest(string Email, string Password);
public record AuthResponse(int UserId, string FullName, string Email, string Role, string Token, bool MustChangePassword);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
