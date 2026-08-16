namespace ErpApi.Models;

public class BankDetail
{
    public int BankDetailId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? IfscCode { get; set; }
    public string? BranchName { get; set; }
    public string? EsiNumber { get; set; }
    public string? PanNumber { get; set; }
}
