using System.Globalization;
using ErpApi.Models;

namespace ErpApi.Services;

// The leave policy arithmetic, kept free of any database access so it can be
// tested on its own. Policy (set in leave_types): Sick = 6 days per calendar year,
// Casual = 1 day per month in half-day steps, Permission = 120 minutes per month.
// Each period stands alone — unused leave lapses, nothing carries forward.
public static class LeaveRules
{
    public static (DateOnly Start, DateOnly End, string Label) PeriodFor(string period, DateOnly d)
    {
        if (period == "YEAR")
            return (new DateOnly(d.Year, 1, 1), new DateOnly(d.Year, 12, 31), $"Jan–Dec {d.Year}");
        var start = new DateOnly(d.Year, d.Month, 1);
        return (start, start.AddMonths(1).AddDays(-1), start.ToString("MMM yyyy", CultureInfo.InvariantCulture));
    }

    // Full allowance if the employee was employed at any point in the period, else nothing.
    // (No proration: someone joining in July still gets the full 6 sick days for that year.)
    public static decimal Entitlement(LeaveType t, DateOnly? joined, DateOnly? left, DateOnly periodStart, DateOnly periodEnd)
    {
        var employed = (joined == null || joined.Value <= periodEnd) && (left == null || left.Value >= periodStart);
        return employed ? t.Allowance : 0m;
    }

    public static decimal Remaining(decimal entitlement, decimal adjusted, decimal taken) => entitlement + adjusted - taken;

    public static string Format(LeaveType t, decimal v)
    {
        if (t.Unit == "MINUTES")
        {
            var m = (int)Math.Round(v);
            return m >= 60 ? (m % 60 == 0 ? $"{m / 60}h" : $"{m / 60}h {m % 60}m") : $"{m}m";
        }
        return v == 1m ? "1 day" : $"{v.ToString("0.##", CultureInfo.InvariantCulture)} days";
    }

    // Returns an error message, or null when the leave can be recorded.
    public static string? ValidateTaken(LeaveType t, decimal amount, decimal remaining, decimal daysAlreadyOnThatDate,
                                        DateOnly date, DateOnly? joined, string periodLabel)
    {
        if (amount <= 0) return "Amount must be greater than zero.";
        if (amount % t.Step != 0) return $"{t.Name} can only be recorded in steps of {Format(t, t.Step)}.";
        if (joined.HasValue && date < joined.Value) return "That date is before the employee joined.";
        if (t.Unit == "DAYS")
        {
            if (amount > 1m) return "Record at most one day of leave per date.";
            if (daysAlreadyOnThatDate + amount > 1m)
                return $"This employee already has {Format(t, daysAlreadyOnThatDate)} of leave recorded on that date.";
        }
        if (amount > remaining)
            return remaining <= 0
                ? $"No {t.Name} left for {periodLabel}."
                : $"Only {Format(t, remaining)} of {t.Name} left for {periodLabel}.";
        return null;
    }

    public static string? ValidateAdjustment(LeaveType t, decimal amount, decimal remaining, string? reason, string periodLabel)
    {
        if (amount == 0) return "Amount can't be zero.";
        if (Math.Abs(amount) % t.Step != 0) return $"{t.Name} can only be adjusted in steps of {Format(t, t.Step)}.";
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 3) return "A reason is required for a balance adjustment.";
        if (remaining + amount < 0)
            return $"That would take the {t.Name} balance for {periodLabel} below zero (currently {Format(t, remaining)}).";
        return null;
    }
}
