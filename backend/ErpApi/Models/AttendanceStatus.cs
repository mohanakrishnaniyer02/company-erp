namespace ErpApi.Models;

public class AttendanceStatus
{
    public int AttendanceStatusId { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal AttendanceUnits { get; set; }
    public string Meaning { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
