namespace ErpApi.DTOs;

public record EmployeeListItem(
    int EmployeeId, string EmpCode, string FullName, string? Designation,
    string? Department, string Type, string Status, string? Location, string RoleType, int? ShiftId, string? ShiftName,
    bool HasLogin, string? OrgDepartment = null, bool PendingDeactivation = false);

public record EmployeeUpsertRequest(
    string EmpCode, string Type, string FullName, string? Designation,
    int? DepartmentId, int? OrgDepartmentId, int? CompanyId, int? ManagerId, int? ShiftId, string? RoleType, string? Password,
    DateOnly? DateOfJoining, DateOnly? DateOfBirth, DateOnly? DateOfLeaving, string? LeavingComments,
    int? LocationId, string? Email, string? PhoneNumber, string? PhotoUrl, string? MaritalStatus,
    BankDetailRequest? Bank = null);

public record BankDetailRequest(
    string? BankName, string? AccountNumber, string? IfscCode,
    string? BranchName, string? EsiNumber, string? PanNumber);

public record ProofRequest(string ProofType, string ProofNumber, string? AttachmentUrl);

public record AddressRequest(
    string AddressType, string? AddressLine1, string? AddressLine2, string? AddressLine3,
    string? EmergencyPerson, string? EmergencyContactNumber);

public record EducationRequest(string? InstitutionName, string? Degree, DateOnly? CompletionDate);

public record ShiftTemplateRequest(
    string ShiftCode, string ShiftName, TimeOnly StartTime, TimeOnly EndTime,
    TimeOnly? LunchStartTime, TimeOnly? LunchEndTime,
    int GraceInMinutes, int GraceOutMinutes,
    int MinimumWorkMinutes, int HalfDayMinutes, int FullDayMinutes,
    int OtStartAfterMinutes, bool IsNightShift, string Status);

public record OrgDepartmentRequest(string DepartmentName);

public record ShiftMappingRequest(int EmployeeId, int ShiftId, DateOnly StartDate, DateOnly EndDate);

public record ShiftMappingItem(
    int ShiftMappingId, int EmployeeId, string EmployeeName, string EmpCode,
    int ShiftId, string ShiftName, string ShiftCode, DateOnly StartDate, DateOnly EndDate);

public record ResolvedShift(int? ShiftId, string? ShiftName, string Source);

public record DepartmentRequest(
    string DepartmentName, bool OtAllowed, int? MinOtMinutes, int? MaxOtMinutes, int RequiredWorkMinutes);

public record AssignShiftRequest(int ShiftId, DateOnly EffectiveFrom);

public record PunchPairDto(TimeOnly? PunchIn, TimeOnly? PunchOut);

public record AttendanceUpsertRequest(
    int EmployeeId, DateOnly AttendanceDate, int ShiftId, int AttendanceStatusId, string EntryType,
    List<PunchPairDto> Punches,
    string? Comments,
    bool ApplyRules = false);

public record AttendanceCalculationRequest(
    int EmployeeId, int ShiftId, List<PunchPairDto> Punches);

public record AttendanceCalculationResult(
    int ActualWorkMinutes, int RequiredWorkMinutes, int CalculatedOtMinutes,
    int RoundedOtMinutes);

public record AttendanceListItem(
    int AttendanceId, int EmployeeId, string EmployeeName, string EmpCode,
    DateOnly AttendanceDate, int ShiftId, string ShiftName, string AttendanceType,
    decimal AttendanceUnits, string EntryType, int ActualWorkMinutes,
    int RequiredWorkMinutes, int CalculatedOtMinutes, int RoundedOtMinutes, int ApprovedOtMinutes,
    string OtStatus, int CountedWorkMinutes,
    string? Comments, List<PunchPairDto> Punches,
    int LateInMinutes, int EarlyOutMinutes, bool RulesApplied);

// ---- Attendance rules (Admin / SuperAdmin configure; HR+ apply while marking attendance) ----
public record RuleTierRequest(
    int MinMinutes, int OccurrenceNo, string Action, decimal Amount,
    string? OnLowBalance, string? FallbackAction, decimal? FallbackAmount);

public record RuleSetRequest(
    string Name, int? OrgDepartmentId, string Watch, string ResetPeriod, bool IsActive,
    List<RuleTierRequest> Tiers);

public record RulePreviewRequest(
    int EmployeeId, int ShiftId, DateOnly AttendanceDate, List<PunchPairDto>? Punches, int? ExcludeAttendanceId);

public record AttendanceStatusRequest(string Status, decimal AttendanceUnits, string Meaning, bool IsActive);

public record OtRoundingRuleRequest(int FromMinutes, int ToMinutes, int RoundedMinutes, bool IsActive);

public record DashboardStats(
    int TotalEmployees, int ActiveEmployees, int ContractEmployees,
    List<DeptCount> ByDepartment, List<RoleCount> ByRole, List<ShiftCount> ByShift,
    int UnassignedShiftCount, List<EmployeeListItem> RecentJoiners,
    DashboardAttendance TodayAttendance);

public record RoleCount(string Role, int Count);
public record ShiftCount(string Shift, int Count);

public record DashboardAttendance(
    string Date, int Present, int Absent, int HalfDay, int PaidLeave,
    int OnDuty, int Other, int TotalRecorded, int TotalWorkMinutes, int TotalOtMinutes);

public record DeptCount(string Department, int Count);

public record LeaveEntryRequest(int EmployeeId, int LeaveTypeId, DateOnly LeaveDate, decimal Amount, string? Reason);

public record LeaveAdjustmentRequest(int EmployeeId, int LeaveTypeId, DateOnly EffectiveDate, decimal Amount, string Reason);

public record LeaveBalanceItem(
    int LeaveTypeId, string Code, string Name, string Unit, string Period, string PeriodLabel,
    decimal Entitlement, decimal Adjusted, decimal Taken, decimal Remaining, decimal Step);

public record LeaveEntryItem(
    int LeaveEntryId, int LeaveTypeId, string LeaveTypeName, string Unit, string Kind,
    DateOnly LeaveDate, decimal Amount, string? Reason, string? RecordedBy, DateTime CreatedAt);

// ---- Approvals ----
public record PendingEmployeePayload(EmployeeUpsertRequest Employee, string? PasswordHash);

public record ApprovalSummary(int Employees, int Overtime);

public record DecisionRequest(string? Note);

public record OtDecisionRequest(int? ApprovedMinutes, string? Note);

public record EmployeeApprovalItem(
    int ApprovalRequestId, string RequestType, string Status,
    string EmpCode, string FullName, string? Designation, string? Type, string? RoleType,
    string? PayrollDepartment, string? Department, string? Company, string? Shift, string? Location,
    DateOnly? DateOfJoining, string? Email, string? PhoneNumber, bool HasLogin,
    string? RequestedBy, DateTime RequestedAt, string? DecidedBy, DateTime? DecidedAt, string? DecisionNote);

public record OvertimeApprovalItem(
    int AttendanceId, DateOnly AttendanceDate, int EmployeeId, string EmployeeName, string EmpCode, string ShiftName,
    TimeOnly? FirstIn, TimeOnly? LastOut,
    int ActualWorkMinutes, int RequiredWorkMinutes, int CalculatedOtMinutes, int RoundedOtMinutes, int ApprovedOtMinutes,
    string OtStatus, string? DecidedBy, DateTime? DecidedAt, string? Note);
