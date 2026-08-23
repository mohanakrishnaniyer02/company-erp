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

    public List<AttendancePunch> Punches { get; set; } = new();

    public int ActualWorkMinutes { get; set; }
    public int RequiredWorkMinutes { get; set; }
    public int CalculatedOtMinutes { get; set; }
    public int RoundedOtMinutes { get; set; }
    public int ApprovedOtMinutes { get; set; }
    public string? Reason { get; set; }

    public int? CreatedByUserId { get; set; } // references employees.employee_id (the person who created this entry)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
