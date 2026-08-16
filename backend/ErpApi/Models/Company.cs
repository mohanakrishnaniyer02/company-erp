namespace ErpApi.Models;

public class Company
{
    public int CompanyId { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public bool IsSubCompany { get; set; }
    public int? ParentCompanyId { get; set; }
}
