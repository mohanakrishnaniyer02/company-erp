using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using ErpApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Controllers;

// Attendance rules: Admin / SuperAdmin define the ladders; HR and above can preview and apply
// them while marking attendance (the apply itself happens in AttendanceController.Create).
[ApiController]
[Route("api/attendance-rules")]
[Authorize]
public class AttendanceRulesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AttendanceRuleService _rules;
    public AttendanceRulesController(AppDbContext db, AttendanceRuleService rules) { _db = db; _rules = rules; }

    [HttpGet]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> GetAll()
    {
        var sets = await _db.AttendanceRuleSets.Include(s => s.Tiers).Include(s => s.OrgDepartment)
            .OrderBy(s => s.OrgDepartmentId == null ? 0 : 1).ThenBy(s => s.OrgDepartment!.DepartmentName).ThenBy(s => s.Watch)
            .ToListAsync();
        return Ok(sets.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Create(RuleSetRequest req)
    {
        var set = new AttendanceRuleSet();
        var error = await Fill(set, req, null);
        if (error != null) return BadRequest(new { message = error });
        _db.AttendanceRuleSets.Add(set);
        await _db.SaveChangesAsync();
        return Ok(await Reload(set.RuleSetId));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Update(int id, RuleSetRequest req)
    {
        var set = await _db.AttendanceRuleSets.Include(s => s.Tiers).FirstOrDefaultAsync(s => s.RuleSetId == id);
        if (set == null) return NotFound();
        var error = await Fill(set, req, id);
        if (error != null) return BadRequest(new { message = error });
        await _db.SaveChangesAsync();
        return Ok(await Reload(id));
    }

    // Past applications keep their own copy of the rule set's name, so deleting is safe.
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(int id)
    {
        var set = await _db.AttendanceRuleSets.FindAsync(id);
        if (set == null) return NotFound();
        _db.AttendanceRuleSets.Remove(set);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // What ticking "Apply attendance rules" would do for these punches. Saves nothing.
    [HttpPost("preview")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Preview(RulePreviewRequest req)
    {
        var emp = await _db.Employees.FindAsync(req.EmployeeId);
        if (emp == null) return NotFound(new { message = "Employee not found." });
        var shift = await _db.ShiftTemplates.FindAsync(req.ShiftId);
        if (shift == null) return NotFound(new { message = "Shift not found." });

        var (late, early) = AttendanceRuleService.Variance(shift, req.Punches);
        var evals = await _rules.EvaluateAsync(emp, shift, req.AttendanceDate, req.Punches, req.ExcludeAttendanceId);
        return Ok(new
        {
            lateInMinutes = late, earlyOutMinutes = early,
            graceInMinutes = shift.GraceInMinutes, graceOutMinutes = shift.GraceOutMinutes,
            evaluations = evals.Select(e => new
            {
                e.Watch, watchName = AttendanceRules.WatchName(e.Watch), e.VarianceMinutes, e.RuleSetName, e.ResetLabel, e.Occurrence,
                charges = e.Charges.Select(c => new { c.Action, c.Amount, label = AttendanceRules.Describe(c) })
            })
        });
    }

    // What was applied to one saved attendance entry.
    [HttpGet("applied/{attendanceId:int}")]
    [Authorize(Roles = "HR,Admin,SuperAdmin")]
    public async Task<IActionResult> Applied(int attendanceId)
    {
        var apps = await _db.AttendanceRuleApplications.Include(a => a.Charges)
            .Where(a => a.AttendanceId == attendanceId).OrderBy(a => a.ApplicationId).ToListAsync();
        return Ok(apps.Select(a => new
        {
            a.Watch, watchName = AttendanceRules.WatchName(a.Watch), a.VarianceMinutes, a.OccurrenceNo, a.RuleSetName, a.AppliedAt,
            charges = a.Charges.Select(c => new { c.Action, c.Amount, label = AttendanceRules.Describe(new Charge(c.Action, c.Amount, c.Note)) })
        }));
    }

    private async Task<string?> Fill(AttendanceRuleSet set, RuleSetRequest req, int? selfId)
    {
        if (string.IsNullOrWhiteSpace(req.Name)) return "Give the rule set a name.";
        if (!AttendanceRules.Watches.Contains(req.Watch)) return "Choose Late In or Early Out.";
        if (!AttendanceRules.ResetPeriods.Contains(req.ResetPeriod)) return "Choose when the occurrence count resets (month or year).";
        if (req.OrgDepartmentId.HasValue && !await _db.OrgDepartments.AnyAsync(d => d.OrgDepartmentId == req.OrgDepartmentId))
            return "Department not found.";
        if (req.Tiers == null || req.Tiers.Count == 0) return "Add at least one step to the ladder.";

        var tiers = new List<AttendanceRuleTier>();
        foreach (var t in req.Tiers)
        {
            var needsFallback = t.Action is "PERMISSION" or "CASUAL" or "SICK" && t.OnLowBalance is "FALLBACK" or "USE_AVAILABLE_THEN_FALLBACK";
            var tier = new AttendanceRuleTier
            {
                MinMinutes = t.MinMinutes, OccurrenceNo = t.OccurrenceNo, Action = t.Action ?? "", Amount = t.Action == "WARNING" ? 0 : t.Amount,
                OnLowBalance = t.Action is "PERMISSION" or "CASUAL" or "SICK" ? (t.OnLowBalance ?? "") : "WARN",
                FallbackAction = needsFallback ? t.FallbackAction : null,
                FallbackAmount = needsFallback ? (t.FallbackAmount ?? 0) : 0
            };
            var err = AttendanceRules.ValidateTier(tier);
            if (err != null) return err;
            tiers.Add(tier);
        }
        if (tiers.GroupBy(t => (t.OccurrenceNo, t.MinMinutes)).Any(g => g.Count() > 1))
            return "Two steps have the same occurrence and threshold. Change one of them.";

        if (req.IsActive)
        {
            var clash = await _db.AttendanceRuleSets.AnyAsync(s => s.IsActive && s.Watch == req.Watch
                && s.OrgDepartmentId == req.OrgDepartmentId && (selfId == null || s.RuleSetId != selfId));
            if (clash) return "There is already an active rule set for that Department and that check. Deactivate it first or edit it instead.";
        }

        set.Name = req.Name.Trim();
        set.OrgDepartmentId = req.OrgDepartmentId;
        set.Watch = req.Watch;
        set.ResetPeriod = req.ResetPeriod;
        set.IsActive = req.IsActive;
        if (selfId != null) _db.AttendanceRuleTiers.RemoveRange(set.Tiers); // the ladder is replaced as a whole
        set.Tiers = tiers;
        return null;
    }

    private async Task<object> Reload(int id) =>
        ToDto(await _db.AttendanceRuleSets.Include(s => s.Tiers).Include(s => s.OrgDepartment).FirstAsync(s => s.RuleSetId == id));

    private static object ToDto(AttendanceRuleSet s) => new
    {
        s.RuleSetId, s.Name, s.OrgDepartmentId,
        departmentName = s.OrgDepartment?.DepartmentName ?? "All Departments",
        s.Watch, s.ResetPeriod, s.IsActive,
        tiers = s.Tiers.OrderBy(t => t.OccurrenceNo).ThenBy(t => t.MinMinutes).Select(t => new
        {
            t.TierId, t.MinMinutes, t.OccurrenceNo, t.Action, t.Amount, t.OnLowBalance, t.FallbackAction, t.FallbackAmount
        })
    };
}
