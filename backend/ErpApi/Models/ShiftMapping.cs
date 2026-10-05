namespace ErpApi.Models;

// Temporarily puts an employee on a different shift for a date range
// (e.g. a General-shift employee covering one week of nights). Outside any
// mapping, the employee's own default shift (employees.shift_id) applies.
public class ShiftMapping
{
    public int ShiftMappingId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public int ShiftId { get; set; }
    public ShiftTemplate? Shift { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
