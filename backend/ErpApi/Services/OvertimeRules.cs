namespace ErpApi.Services;

// The overtime-approval arithmetic, free of database access so it can be tested on its own.
//
// Statuses on an attendance entry:
//   NONE      — no OT (rounded OT is 0)
//   PENDING   — OT calculated, waiting for an Admin/SuperAdmin; counts as 0 until decided
//   APPROVED  — approved (possibly edited down/up by the approver); ApprovedOtMinutes counts
//   REJECTED  — rejected; the OT time is skipped
public static class OvertimeRules
{
    // What an entry's OT status/approved minutes become when attendance is (re)saved.
    // A decision survives a re-save only if the OT itself didn't change; otherwise the
    // new OT has to be approved afresh.
    public static (string Status, int ApprovedMinutes) StatusOnSave(string? prevStatus, int prevRounded, int prevApproved, int newRounded)
    {
        if (newRounded <= 0) return ("NONE", 0);
        if (prevStatus is "PENDING" or "APPROVED" or "REJECTED" && prevRounded == newRounded)
            return (prevStatus, prevStatus == "APPROVED" ? prevApproved : 0);
        return ("PENDING", 0);
    }

    // Work that counts toward pay: the required time (or less, if they worked less)
    // plus any APPROVED overtime. Pending and rejected OT adds nothing.
    public static int CountedWorkMinutes(int actual, int required, string otStatus, int approvedOt) =>
        Math.Min(actual, required) + (otStatus == "APPROVED" ? approvedOt : 0);

    // Error message, or null if the approval is acceptable. The approver may change the
    // minutes (never above what was actually worked as OT); changing them from the
    // rounded figure needs a note.
    public static string? ValidateApproval(int calculatedOt, int roundedOt, int approvedMinutes, string? note)
    {
        if (approvedMinutes < 1) return "Approved OT must be at least 1 minute — use Reject to approve none.";
        if (approvedMinutes > calculatedOt) return $"Approved OT can't exceed the {calculatedOt} minutes actually worked as overtime.";
        if (approvedMinutes != roundedOt && (string.IsNullOrWhiteSpace(note) || note.Trim().Length < 3))
            return "A note is required when approved OT differs from the rounded OT.";
        return null;
    }
}
