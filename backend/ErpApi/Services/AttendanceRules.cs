using System.Globalization;
using ErpApi.DTOs;
using ErpApi.Models;

namespace ErpApi.Services;

public record Charge(string Action, decimal Amount, string? Note = null);

// Lateness detection and the rule-ladder arithmetic, kept free of any database access
// so it can be tested on its own. The database-facing half is AttendanceRuleService.
public static class AttendanceRules
{
    public const string LateIn = "LATE_IN";
    public const string EarlyOut = "EARLY_OUT";

    public static readonly string[] Watches = { LateIn, EarlyOut };
    public static readonly string[] ResetPeriods = { "MONTH", "YEAR" };
    public static readonly string[] Actions = { "PERMISSION", "CASUAL", "SICK", "LOP", "WARNING" };
    public static readonly string[] FallbackActions = { "CASUAL", "SICK", "LOP" };
    public static readonly string[] LowBalanceModes = { "USE_AVAILABLE", "FALLBACK", "USE_AVAILABLE_THEN_FALLBACK", "WARN" };

    private static int M(TimeOnly t) => t.Hour * 60 + t.Minute;

    // Clock-time difference folded into -12h..+12h, so a night shift (22:00-06:00) behaves.
    private static int Fold(int diff)
    {
        while (diff > 720) diff -= 1440;
        while (diff < -720) diff += 1440;
        return diff;
    }

    // First In and last Out of the day, taken from complete In/Out pairs only.
    public static (TimeOnly? FirstIn, TimeOnly? LastOut) FirstInLastOut(IEnumerable<PunchPairDto>? punches)
    {
        var complete = (punches ?? Enumerable.Empty<PunchPairDto>()).Where(p => p.PunchIn.HasValue && p.PunchOut.HasValue).ToList();
        return complete.Count == 0 ? (null, null) : (complete.First().PunchIn, complete.Last().PunchOut);
    }

    // Minutes late, measured from the shift start. Within Grace In it counts as on time (0);
    // beyond it the FULL lateness counts, not just the part past the grace.
    public static int LateInMinutes(TimeOnly shiftStart, TimeOnly? firstIn, int graceIn)
    {
        if (!firstIn.HasValue) return 0;
        var d = Fold(M(firstIn.Value) - M(shiftStart));
        return d > graceIn ? d : 0;
    }

    public static int EarlyOutMinutes(TimeOnly shiftEnd, TimeOnly? lastOut, int graceOut)
    {
        if (!lastOut.HasValue) return 0;
        var d = Fold(M(shiftEnd) - M(lastOut.Value));
        return d > graceOut ? d : 0;
    }

    // Which step applies. The occurrence picks the row of the ladder (past the last defined
    // occurrence the last one repeats); within that row the highest threshold the variance meets wins.
    // Returns null when nothing matches — then nothing is applied and nothing is counted.
    public static AttendanceRuleTier? PickTier(IEnumerable<AttendanceRuleTier> tiers, int occurrence, int variance)
    {
        var list = tiers.ToList();
        var effective = list.Where(t => t.OccurrenceNo <= occurrence).Select(t => t.OccurrenceNo).DefaultIfEmpty(0).Max();
        if (effective == 0) return null;
        return list.Where(t => t.OccurrenceNo == effective && t.MinMinutes <= variance)
                   .OrderByDescending(t => t.MinMinutes).FirstOrDefault();
    }

    public static decimal RoundDown(decimal value, decimal step) =>
        step <= 0 ? value : Math.Floor(value / step) * step;

    // Turns a step into the actual charges, given what is left in the balances.
    //   primaryAvailable  — remaining balance of tier.Action (ignored for LOP / WARNING)
    //   primaryStep       — smallest recordable amount for that leave type
    //   fallbackAvailable — remaining balance of tier.FallbackAction (ignored for LOP)
    public static List<Charge> PlanCharges(AttendanceRuleTier t, decimal primaryAvailable, decimal primaryStep, decimal fallbackAvailable)
    {
        if (t.Action == "WARNING") return new() { new Charge("WARNING", 0) };
        if (t.Action == "LOP") return new() { new Charge("LOP", t.Amount) };
        if (primaryAvailable >= t.Amount) return new() { new Charge(t.Action, t.Amount) };

        var usable = RoundDown(Math.Max(0, primaryAvailable), primaryStep);
        var charges = new List<Charge>();
        switch (t.OnLowBalance)
        {
            case "USE_AVAILABLE":
                charges.Add(usable > 0 ? new Charge(t.Action, usable, "Balance covered only part of this deduction")
                                       : new Charge("WARNING", 0, $"No {Name(t.Action)} balance left"));
                break;
            case "FALLBACK":
                charges.Add(Fallback(t, fallbackAvailable));
                break;
            case "USE_AVAILABLE_THEN_FALLBACK":
                if (usable > 0) charges.Add(new Charge(t.Action, usable));
                charges.Add(Fallback(t, fallbackAvailable));
                break;
            default: // WARN
                charges.Add(new Charge("WARNING", 0, $"Not enough {Name(t.Action)} balance"));
                break;
        }
        return charges;
    }

    private static Charge Fallback(AttendanceRuleTier t, decimal fallbackAvailable)
    {
        var fa = t.FallbackAction ?? "LOP";
        if (fa == "LOP" || fa == "WARNING") return new Charge(fa, t.FallbackAmount);
        return fallbackAvailable >= t.FallbackAmount
            ? new Charge(fa, t.FallbackAmount)
            : new Charge("LOP", t.FallbackAmount, $"Not enough {Name(fa)} balance, charged as loss of pay");
    }

    public static string Name(string action) => action switch
    {
        "PERMISSION" => "Permission", "CASUAL" => "Casual Leave", "SICK" => "Sick Leave",
        "LOP" => "Loss of Pay", _ => "Warning"
    };

    public static string WatchName(string watch) => watch == EarlyOut ? "Early Out" : "Late In";

    public static string Describe(Charge c)
    {
        var amt = c.Amount.ToString("0.##", CultureInfo.InvariantCulture);
        var text = c.Action switch
        {
            "PERMISSION" => $"Deduct {amt} min Permission",
            "CASUAL" => $"Deduct {amt} day Casual Leave",
            "SICK" => $"Deduct {amt} day Sick Leave",
            "LOP" => $"Loss of Pay: {amt} day",
            _ => "Warning only (no deduction)"
        };
        return string.IsNullOrEmpty(c.Note) ? text : $"{text} ({c.Note})";
    }

    // Returns an error message for an invalid step, or null. Used when saving a rule set.
    public static string? ValidateTier(AttendanceRuleTier t)
    {
        if (t.MinMinutes < 1) return "Each step needs a threshold of at least 1 minute.";
        if (t.OccurrenceNo < 1) return "Occurrence must be 1 or more.";
        if (!Actions.Contains(t.Action)) return $"Unknown action '{t.Action}'.";
        if (t.Action != "WARNING")
        {
            if (t.Amount <= 0) return "Each deduction needs an amount greater than zero.";
            var step = StepFor(t.Action);
            if (t.Amount % step != 0) return $"{Name(t.Action)} must be in steps of {step.ToString("0.##", CultureInfo.InvariantCulture)}.";
        }
        if (t.Action is "PERMISSION" or "CASUAL" or "SICK")
        {
            if (!LowBalanceModes.Contains(t.OnLowBalance)) return "Choose what happens when the balance is too low.";
            if (t.OnLowBalance is "FALLBACK" or "USE_AVAILABLE_THEN_FALLBACK")
            {
                if (t.FallbackAction == null || !FallbackActions.Contains(t.FallbackAction)) return "Choose a fallback deduction (Casual, Sick or Loss of Pay).";
                if (t.FallbackAction == t.Action) return "The fallback must be different from the main deduction.";
                if (t.FallbackAmount <= 0) return "The fallback needs an amount greater than zero.";
                if (t.FallbackAmount % StepFor(t.FallbackAction) != 0) return $"{Name(t.FallbackAction)} must be in steps of {StepFor(t.FallbackAction).ToString("0.##", CultureInfo.InvariantCulture)}.";
            }
        }
        return null;
    }

    public static decimal StepFor(string action) => action switch
    {
        "PERMISSION" => 1m, "CASUAL" => 0.5m, "SICK" => 1m, "LOP" => 0.5m, _ => 1m
    };
}
