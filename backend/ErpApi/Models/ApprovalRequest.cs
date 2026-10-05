namespace ErpApi.Models;

// A pending (or decided) request to add or deactivate an employee. Nothing
// happens to the employee table until an Admin/SuperAdmin approves it.
//   EMPLOYEE_ADD    — Payload holds the full employee details to create (with the login
//                     password already hashed — the plain password is never stored).
//   EMPLOYEE_DELETE — TargetEmployeeId is who to deactivate.
public class ApprovalRequest
{
    public int ApprovalRequestId { get; set; }
    public string RequestType { get; set; } = string.Empty;
    public string Status { get; set; } = "PENDING";          // PENDING | APPROVED | REJECTED
    public int? TargetEmployeeId { get; set; }                // delete: who; add: the employee created on approval
    public string? SummaryCode { get; set; }                  // employee ID, for display and duplicate checks
    public string SummaryName { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";               // JSON text
    public int? RequestedByEmployeeId { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public int? DecidedByEmployeeId { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }
}
