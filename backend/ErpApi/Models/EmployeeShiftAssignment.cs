namespace ErpApi.Models;

public class EmployeeShiftAssignment
{
    public int AssignmentId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public int ShiftId { get; set; }
    public ShiftTemplate? Shift { get; set; }
    public DateOnly EffectiveFrom { get; set; }
}
