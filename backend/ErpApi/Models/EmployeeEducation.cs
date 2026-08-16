namespace ErpApi.Models;

public class EmployeeEducation
{
    public int EducationId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public string? InstitutionName { get; set; }
    public string? Degree { get; set; }
    public DateOnly? CompletionDate { get; set; }
}
