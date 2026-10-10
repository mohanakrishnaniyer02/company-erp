namespace ErpApi.Models;

// One raw capture from a biometric machine, as stored in OUR database (the "Local" source).
// Same shape as the machine's own Attendance_MachineData table. Used when the capture
// service writes into this database, and for the sample data. When the "SqlServer" source is
// configured, the app reads the machine's own table instead and this table is not used.
public class BiometricPunch
{
    public int PunchId { get; set; }
    public int? DeviceOid { get; set; }                 // which machine
    public string DeviceEmpId { get; set; } = string.Empty; // the employee's number ON the machine
    public DateOnly AttendanceDate { get; set; }
    public DateTime CapturedAt { get; set; }            // date + time captured
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string RecStatus { get; set; } = "A";        // A = active
}
