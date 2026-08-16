namespace ErpApi.Models;

public class ProofDocument
{
    public int ProofId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public string ProofType { get; set; } = string.Empty;    // Aadhaar | PAN | Passport | Driving Licence
    public string ProofNumber { get; set; } = string.Empty;
    public string? AttachmentUrl { get; set; }
}
