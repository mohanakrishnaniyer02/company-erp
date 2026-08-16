namespace ErpApi.Models;

public class Employee
{
    public int EmployeeId { get; set; }
    public string EmpCode { get; set; } = string.Empty;
    public string Type { get; set; } = "Regular";       // Regular | Contract
    public string FullName { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public int? CompanyId { get; set; }
    public Company? Company { get; set; }
    public int? ManagerId { get; set; }
    public Employee? Manager { get; set; }
    public DateOnly? DateOfJoining { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public DateOnly? DateOfLeaving { get; set; }
    public string? LeavingComments { get; set; }
    public int? LocationId { get; set; }
    public Location? LocationRef { get; set; }
    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }
    public string? PhotoUrl { get; set; }
    public string? MaritalStatus { get; set; }          // Single | Married
    public string Status { get; set; } = "Active";      // Active | Inactive
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public BankDetail? BankDetail { get; set; }
    public List<ProofDocument> ProofDocuments { get; set; } = new();
    public List<EmployeeAddress> Addresses { get; set; } = new();
    public List<EmployeeEducation> Education { get; set; } = new();
    public List<EmployeeShiftAssignment> ShiftAssignments { get; set; } = new();
}
