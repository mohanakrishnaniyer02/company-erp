namespace ErpApi.Models;

public class AttendanceEntry
{
    public int AttendanceId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateOnly AttendanceDate { get; set; }
    public int ShiftId { get; set; }
    public ShiftTemplate? Shift { get; set; }
    public int AttendanceStatusId { get; set; }
    public AttendanceStatus? AttendanceStatus { get; set; }
    public string EntryType { get; set; } = "User"; // User | Biometric

    public TimeOnly? In1 { get; set; }
    public TimeOnly? Out1 { get; set; }
    public TimeOnly? In2 { get; set; }
    public TimeOnly? Out2 { get; set; }
    public TimeOnly? In3 { get; set; }
    public TimeOnly? Out3 { get; set; }
    public TimeOnly? In4 { get; set; }
    public TimeOnly? Out4 { get; set; }
    public TimeOnly? In5 { get; set; }
    public TimeOnly? Out5 { get; set; }

    public int ActualWorkMinutes { get; set; }
    public int RequiredWorkMinutes { get; set; }
    public int CalculatedOtMinutes { get; set; }
    public int RoundedOtMinutes { get; set; }
    public int ApprovedOtMinutes { get; set; }
    public string? Reason { get; set; }

    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
