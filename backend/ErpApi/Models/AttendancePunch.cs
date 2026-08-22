namespace ErpApi.Models;

// One row per In/Out pair for a given attendance entry. Replaces the old fixed
// In1/Out1..In5/Out5 columns — an employee can now have as many punch pairs
// in a day as they actually made, with no artificial cap.
public class AttendancePunch
{
    public int PunchId { get; set; }
    public int AttendanceId { get; set; }
    public AttendanceEntry? AttendanceEntry { get; set; }
    public int SequenceNo { get; set; }
    public TimeOnly? PunchIn { get; set; }
    public TimeOnly? PunchOut { get; set; }
}
