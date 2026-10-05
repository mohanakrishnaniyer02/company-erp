namespace ErpApi.Services;

public static class EmployeeRules
{
    public static readonly string[] LoginRoles = { "HR", "Admin", "SuperAdmin" };

    // SuperAdmin can manage anyone. Admin can manage Admin/HR/User (not SuperAdmin).
    // HR can manage HR/User (not Admin/SuperAdmin). Used for who may create/edit/deactivate
    // an employee, which role they may assign, and who may approve such a request.
    public static readonly Dictionary<string, int> RoleRank = new()
    {
        { "User", 0 }, { "HR", 1 }, { "Admin", 2 }, { "SuperAdmin", 3 }
    };

    public static int RankOf(string? role) => role != null && RoleRank.TryGetValue(role, out var r) ? r : 0;

    public static bool CanManage(string? callerRole, string? targetRole) => RankOf(callerRole) >= RankOf(targetRole);

    public static string? ValidateLoginRequirements(string roleType, string? password, string? email, bool hasExistingLogin)
    {
        if (!LoginRoles.Contains(roleType)) return null;
        if (string.IsNullOrWhiteSpace(email))
            return "Email is required to grant HR/Admin/SuperAdmin access.";
        if (!hasExistingLogin && string.IsNullOrWhiteSpace(password))
            return "A password is required to grant HR/Admin/SuperAdmin access.";
        if (!string.IsNullOrWhiteSpace(password) &&
            (password.Length < 8 || !password.Any(char.IsDigit) || !password.Any(char.IsLetter)))
            return "Password must be at least 8 characters and include both letters and numbers.";
        return null;
    }
}
