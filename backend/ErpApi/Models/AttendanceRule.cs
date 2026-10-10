namespace ErpApi.Models;

// A "ladder" of consequences for lateness (or leaving early). One rule set belongs to
// one organisational Department (OrgDepartmentId = null means "All Departments", the
// default for any Department without a ladder of its own) and watches either Late In
// or Early Out. Rules are only ever applied when HR ticks the box on an attendance entry.
public class AttendanceRuleSet
{
    public int RuleSetId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int? OrgDepartmentId { get; set; }
    public OrgDepartment? OrgDepartment { get; set; }
    public string Watch { get; set; } = "LATE_IN";        // LATE_IN | EARLY_OUT
    public string ResetPeriod { get; set; } = "MONTH";    // MONTH | YEAR — when the occurrence count goes back to zero
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<AttendanceRuleTier> Tiers { get; set; } = new();
}

// One step of the ladder: "when the variance is at least MinMinutes, on the OccurrenceNo-th time
// in the period, do Action". Beyond the highest defined occurrence the last one keeps repeating.
public class AttendanceRuleTier
{
    public int TierId { get; set; }
    public int RuleSetId { get; set; }
    public AttendanceRuleSet? RuleSet { get; set; }
    public int MinMinutes { get; set; }
    public int OccurrenceNo { get; set; } = 1;
    public string Action { get; set; } = "PERMISSION";        // PERMISSION (minutes) | CASUAL | SICK | LOP (days) | WARNING
    public decimal Amount { get; set; }
    // What to do when the balance for Action can't cover Amount.
    public string OnLowBalance { get; set; } = "USE_AVAILABLE_THEN_FALLBACK"; // USE_AVAILABLE | FALLBACK | USE_AVAILABLE_THEN_FALLBACK | WARN
    public string? FallbackAction { get; set; } = "CASUAL";   // CASUAL | SICK | LOP (days)
    public decimal FallbackAmount { get; set; } = 0.5m;
}

// The record that a rule set was applied to one attendance entry.
public class AttendanceRuleApplication
{
    public int ApplicationId { get; set; }
    public int AttendanceId { get; set; }
    public AttendanceEntry? AttendanceEntry { get; set; }
    public int EmployeeId { get; set; }
    public DateOnly AttendanceDate { get; set; }
    public int? RuleSetId { get; set; }
    public string RuleSetName { get; set; } = string.Empty;  // snapshot, survives the rule set being edited or deleted
    public int? TierId { get; set; }
    public string Watch { get; set; } = "LATE_IN";
    public int VarianceMinutes { get; set; }
    public int OccurrenceNo { get; set; }
    public int? AppliedByEmployeeId { get; set; }
    public DateTime AppliedAt { get; set; } = DateTime.UtcNow;
    public List<AttendanceRuleCharge> Charges { get; set; } = new();
}

// What was actually taken: a deduction from a leave balance (linked to its leave_entries row),
// loss of pay, or just a warning.
public class AttendanceRuleCharge
{
    public int ChargeId { get; set; }
    public int ApplicationId { get; set; }
    public AttendanceRuleApplication? Application { get; set; }
    public string Action { get; set; } = "WARNING";           // PERMISSION | CASUAL | SICK | LOP | WARNING
    public decimal Amount { get; set; }
    public int? LeaveEntryId { get; set; }
    public LeaveEntry? LeaveEntry { get; set; }
    public string? Note { get; set; }
}
