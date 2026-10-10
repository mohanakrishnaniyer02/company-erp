using ErpApi.DTOs;

namespace ErpApi.Services;

// Turning the raw capture times of one day into usable In/Out pairs. No database access.
public static class BiometricPunchRules
{
    // Drops a capture that comes within `windowSeconds` of the previous KEPT one — a double
    // scan (face + thumb, or the same finger twice). Times are sorted first. A window of 0 keeps everything.
    public static (List<DateTime> Kept, int Ignored) Dedupe(IEnumerable<DateTime> captures, int windowSeconds)
    {
        var kept = new List<DateTime>();
        var ignored = 0;
        foreach (var t in captures.OrderBy(x => x))
        {
            if (windowSeconds > 0 && kept.Count > 0 && (t - kept[^1]).TotalSeconds < windowSeconds) { ignored++; continue; }
            kept.Add(t);
        }
        return (kept, ignored);
    }

    // The machine only records "someone scanned at this time", not In or Out, so captures alternate:
    // 1st = In, 2nd = Out, 3rd = In... An odd number leaves the last In without an Out.
    public static List<PunchPairDto> Pair(IReadOnlyList<DateTime> kept)
    {
        var pairs = new List<PunchPairDto>();
        for (var i = 0; i < kept.Count; i += 2)
        {
            var inTime = TimeOnly.FromDateTime(kept[i]);
            TimeOnly? outTime = i + 1 < kept.Count ? TimeOnly.FromDateTime(kept[i + 1]) : null;
            pairs.Add(new PunchPairDto(inTime, outTime));
        }
        return pairs;
    }
}
