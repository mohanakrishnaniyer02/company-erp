namespace ErpApi.Models;

public class ShiftTemplate
{
    public int ShiftId { get; set; }
    public string ShiftCode { get; set; } = string.Empty;
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public TimeOnly? LunchStartTime { get; set; }
    public TimeOnly? LunchEndTime { get; set; }
    public int GraceInMinutes { get; set; }
    public int GraceOutMinutes { get; set; }
    public int LateAfterMinutes { get; set; }
    public int EarlyOutMinutes { get; set; }
    public int MinimumWorkMinutes { get; set; }
    public int HalfDayMinutes { get; set; }
    public int FullDayMinutes { get; set; }
    public bool OtAllowed { get; set; }
    public int OtStartAfterMinutes { get; set; }
    public bool IsNightShift { get; set; }
    public string Status { get; set; } = "Active";
}
