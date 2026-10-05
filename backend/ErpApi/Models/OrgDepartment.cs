namespace ErpApi.Models;

// The organisational department an employee belongs to (e.g. "Operations").
// Deliberately separate from Department (now "Payroll Department"), which
// carries the OT policy and required work hours used for payroll calculation.
public class OrgDepartment
{
    public int OrgDepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
}
