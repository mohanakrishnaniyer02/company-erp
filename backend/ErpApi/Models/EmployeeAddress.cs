namespace ErpApi.Models;

public class EmployeeAddress
{
    public int AddressId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public string AddressType { get; set; } = "Current";     // Current | Permanent
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? AddressLine3 { get; set; }
    public string? EmergencyPerson { get; set; }
    public string? EmergencyContactNumber { get; set; }
}
