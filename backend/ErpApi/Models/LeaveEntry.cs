namespace ErpApi.Models;

// One recorded movement on an employee's leave balance.
//   TAKEN  — leave actually used; Amount is positive and deducts from the balance.
//   ADJUST — a manual correction/exception; Amount is signed (+ adds, - deducts) and needs a reason.
public class LeaveEntry
{
    public int LeaveEntryId { get; set; }
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public int LeaveTypeId { get; set; }
    public LeaveType? LeaveType { get; set; }
    public string Kind { get; set; } = "TAKEN";
    public DateOnly LeaveDate { get; set; }                // decides which period (year/month) it counts against
    public decimal Amount { get; set; }
    public string? Reason { get; set; }
    public int? CreatedByEmployeeId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
