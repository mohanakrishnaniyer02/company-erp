namespace ErpApi.DTOs;

public record LoginRequest(string EmpCode, string Password);
public record AuthResponse(int UserId, string FullName, string Email, string Role, string Token, bool MustChangePassword);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
