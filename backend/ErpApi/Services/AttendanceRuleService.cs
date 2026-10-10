using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Services;

public record RuleEvaluation(
    string Watch, int VarianceMinutes, int RuleSetId, string RuleSetName, string ResetLabel,
    int Occurrence, int TierId, List<Charge> Charges);

// The database-facing half of the attendance rules: works out which ladder applies to an
// employee, which occurrence this is, what each step would cost against the current leave
// balances, and records / undoes the result. The arithmetic itself is in AttendanceRules.
public class AttendanceRuleService
{
    private readonly AppDbContext _db;
    public AttendanceRuleService(AppDbContext db) => _db = db;

    public static (int LateIn, int EarlyOut) Variance(ShiftTemplate shift, IEnumerable<PunchPairDto>? punches)
    {
        var (firstIn, lastOut) = AttendanceRules.FirstInLastOut(punches);
        return (AttendanceRules.LateInMinutes(shift.StartTime, firstIn, shift.GraceInMinutes),
                AttendanceRules.EarlyOutMinutes(shift.EndTime, lastOut, shift.GraceOutMinutes));
    }

    // What applying the rules to this day would do. Nothing is saved. excludeAttendanceId is the
    // entry being re-saved, so its own earlier deductions don't count against itself.
    public async Task<List<RuleEvaluation>> EvaluateAsync(
        Employee emp, ShiftTemplate shift, DateOnly date, IEnumerable<PunchPairDto>? punches, int? excludeAttendanceId)
    {
        var (late, early) = Variance(shift, punches);
        var result = new List<RuleEvaluation>();

        var excludedLeaveIds = excludeAttendanceId.HasValue
            ? await _db.AttendanceRuleCharges
                .Where(c => c.Application!.AttendanceId == excludeAttendanceId.Value && c.LeaveEntryId != null)
                .Select(c => c.LeaveEntryId!.Value).ToListAsync()
            : new List<int>();
        var types = await _db.LeaveTypes.ToDictionaryAsync(t => t.Code);
        var pending = new Dictionary<string, decimal>(); // deductions planned earlier in this same evaluation

        foreach (var (watch, variance) in new[] { (AttendanceRules.LateIn, late), (AttendanceRules.EarlyOut, early) })
        {
            if (variance <= 0) continue;

            var set = await FindRuleSetAsync(emp.OrgDepartmentId, watch);
            if (set == null || set.Tiers.Count == 0) continue;

            var (pStart, pEnd, label) = LeaveRules.PeriodFor(set.ResetPeriod, date);
            var before = await _db.AttendanceRuleApplications.CountAsync(a =>
                a.EmployeeId == emp.EmployeeId && a.Watch == watch &&
                a.AttendanceDate >= pStart && a.AttendanceDate <= pEnd &&
                (excludeAttendanceId == null || a.AttendanceId != excludeAttendanceId.Value));
            var occurrence = before + 1;

            var tier = AttendanceRules.PickTier(set.Tiers, occurrence, variance);
            if (tier == null) continue;

            decimal primaryAvail = 0, primaryStep = 1, fallbackAvail = 0;
            if (tier.Action is "PERMISSION" or "CASUAL" or "SICK")
            {
                primaryAvail = await RemainingAsync(emp, types[tier.Action], date, excludedLeaveIds, pending);
                primaryStep = types[tier.Action].Step;
            }
            if (tier.FallbackAction is "CASUAL" or "SICK")
                fallbackAvail = await RemainingAsync(emp, types[tier.FallbackAction], date, excludedLeaveIds, pending);

            var charges = AttendanceRules.PlanCharges(tier, primaryAvail, primaryStep, fallbackAvail);
            foreach (var c in charges.Where(c => c.Action is "PERMISSION" or "CASUAL" or "SICK"))
                pending[c.Action] = pending.GetValueOrDefault(c.Action) + c.Amount;

            result.Add(new RuleEvaluation(watch, variance, set.RuleSetId, set.Name, label, occurrence, tier.TierId, charges));
        }
        return result;
    }

    // Records the evaluation against a saved attendance entry. Any earlier application on the
    // same entry must already have been reverted.
    public async Task ApplyAsync(AttendanceEntry entry, List<RuleEvaluation> evaluations, int? appliedBy)
    {
        if (evaluations.Count == 0) return;
        var types = await _db.LeaveTypes.ToDictionaryAsync(t => t.Code);

        foreach (var ev in evaluations)
        {
            var app = new AttendanceRuleApplication
            {
                AttendanceId = entry.AttendanceId, EmployeeId = entry.EmployeeId, AttendanceDate = entry.AttendanceDate,
                RuleSetId = ev.RuleSetId, RuleSetName = ev.RuleSetName, TierId = ev.TierId, Watch = ev.Watch,
                VarianceMinutes = ev.VarianceMinutes, OccurrenceNo = ev.Occurrence,
                AppliedByEmployeeId = appliedBy, AppliedAt = DateTime.UtcNow
            };
            foreach (var c in ev.Charges)
            {
                var charge = new AttendanceRuleCharge { Action = c.Action, Amount = c.Amount, Note = c.Note };
                if (c.Action is "PERMISSION" or "CASUAL" or "SICK")
                {
                    charge.LeaveEntry = new LeaveEntry
                    {
                        EmployeeId = entry.EmployeeId, LeaveTypeId = types[c.Action].LeaveTypeId, Kind = "TAKEN",
                        LeaveDate = entry.AttendanceDate, Amount = c.Amount,
                        Reason = $"Attendance rule: {AttendanceRules.WatchName(ev.Watch)} {ev.VarianceMinutes} min ({ev.RuleSetName}, occurrence {ev.Occurrence})",
                        CreatedByEmployeeId = appliedBy
                    };
                }
                app.Charges.Add(charge);
            }
            _db.AttendanceRuleApplications.Add(app);
        }
    }

    // Undoes everything the rules did on this entry, returning the leave balances. Does not save.
    public async Task RevertAsync(int attendanceId)
    {
        var apps = await _db.AttendanceRuleApplications
            .Include(a => a.Charges).Where(a => a.AttendanceId == attendanceId).ToListAsync();
        if (apps.Count == 0) return;
        var leaveIds = apps.SelectMany(a => a.Charges).Where(c => c.LeaveEntryId.HasValue).Select(c => c.LeaveEntryId!.Value).ToList();
        if (leaveIds.Count > 0)
            _db.LeaveEntries.RemoveRange(await _db.LeaveEntries.Where(l => leaveIds.Contains(l.LeaveEntryId)).ToListAsync());
        _db.AttendanceRuleApplications.RemoveRange(apps);
    }

    // The active ladder for this Department; if the Department has none, the "All Departments" one.
    private async Task<AttendanceRuleSet?> FindRuleSetAsync(int? orgDepartmentId, string watch)
    {
        if (orgDepartmentId.HasValue)
        {
            var own = await _db.AttendanceRuleSets.Include(s => s.Tiers)
                .FirstOrDefaultAsync(s => s.IsActive && s.Watch == watch && s.OrgDepartmentId == orgDepartmentId);
            if (own != null) return own;
        }
        return await _db.AttendanceRuleSets.Include(s => s.Tiers)
            .FirstOrDefaultAsync(s => s.IsActive && s.Watch == watch && s.OrgDepartmentId == null);
    }

    private async Task<decimal> RemainingAsync(Employee emp, LeaveType t, DateOnly date, List<int> excludedLeaveIds, Dictionary<string, decimal> pending)
    {
        var (start, end, _) = LeaveRules.PeriodFor(t.Period, date);
        var entitlement = LeaveRules.Entitlement(t, emp.DateOfJoining, emp.DateOfLeaving, start, end);
        var rows = await _db.LeaveEntries
            .Where(x => x.EmployeeId == emp.EmployeeId && x.LeaveTypeId == t.LeaveTypeId && x.LeaveDate >= start && x.LeaveDate <= end
                        && !excludedLeaveIds.Contains(x.LeaveEntryId))
            .Select(x => new { x.Kind, x.Amount }).ToListAsync();
        var taken = rows.Where(r => r.Kind == "TAKEN").Sum(r => r.Amount);
        var adjusted = rows.Where(r => r.Kind == "ADJUST").Sum(r => r.Amount);
        return LeaveRules.Remaining(entitlement, adjusted, taken) - pending.GetValueOrDefault(t.Code);
    }
}
