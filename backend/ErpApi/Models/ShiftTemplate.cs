namespace ErpApi.Models;

public class ShiftTemplate
{
    public int ShiftId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public bool IsNextDay { get; set; }
    public TimeOnly? Break1Start { get; set; }
    public TimeOnly? Break1End { get; set; }
    public TimeOnly? Break2Start { get; set; }
    public TimeOnly? Break2End { get; set; }
    public TimeOnly? LunchStart { get; set; }
    public TimeOnly? LunchEnd { get; set; }
}
