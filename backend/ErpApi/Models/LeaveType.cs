namespace ErpApi.Models;

// The leave policy for one kind of leave. Balances are NOT stored — they are
// derived from this policy plus what has been recorded in leave_entries, so
// every employee always has the right entitlement without anyone granting it.
public class LeaveType
{
    public int LeaveTypeId { get; set; }
    public string Code { get; set; } = string.Empty;      // SICK | CASUAL | PERMISSION
    public string Name { get; set; } = string.Empty;
    public string Unit { get; set; } = "DAYS";             // DAYS | MINUTES
    public string Period { get; set; } = "YEAR";           // YEAR (Jan-Dec) | MONTH — entitlement resets each period, nothing carries forward
    public decimal Allowance { get; set; }                 // per period, in Unit
    public decimal Step { get; set; } = 1;                 // smallest amount that can be recorded, in Unit
}
