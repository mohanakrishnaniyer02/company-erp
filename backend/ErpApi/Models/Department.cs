namespace ErpApi.Models;

public class Department
{
    public int DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public bool OtAllowed { get; set; }
    public int? MinOtMinutes { get; set; }
    public int? MaxOtMinutes { get; set; }
    public int RequiredWorkMinutes { get; set; } = 480;
}
