namespace ErpApi.DTOs;

public record EmployeeListItem(
    int EmployeeId, string EmpCode, string FullName, string? Designation,
    string? Department, string Type, string Status, string? Location, string RoleType, int? ShiftId, string? ShiftName);

public record EmployeeUpsertRequest(
    string EmpCode, string Type, string FullName, string? Designation,
    int? DepartmentId, int? CompanyId, int? ManagerId, int? ShiftId, string? RoleType,
    DateOnly? DateOfJoining, DateOnly? DateOfBirth, DateOnly? DateOfLeaving, string? LeavingComments,
    int? LocationId, string? Email, string? PhoneNumber, string? PhotoUrl, string? MaritalStatus);

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
    int GraceInMinutes, int GraceOutMinutes, int LateAfterMinutes, int EarlyOutMinutes,
    int MinimumWorkMinutes, int HalfDayMinutes, int FullDayMinutes,
    bool OtAllowed, int OtStartAfterMinutes, bool IsNightShift, string Status);

public record DepartmentRequest(
    string DepartmentName, bool OtAllowed, int? MinOtMinutes, int? MaxOtMinutes, int RequiredWorkMinutes);

public record AssignShiftRequest(int ShiftId, DateOnly EffectiveFrom);

public record PunchPairDto(TimeOnly? PunchIn, TimeOnly? PunchOut);

public record AttendanceUpsertRequest(
    int EmployeeId, DateOnly AttendanceDate, int ShiftId, int AttendanceStatusId, string EntryType,
    List<PunchPairDto> Punches,
    int? ApprovedOtMinutes, string? Reason);

public record AttendanceCalculationRequest(
    int EmployeeId, int ShiftId, List<PunchPairDto> Punches);

public record AttendanceCalculationResult(
    int ActualWorkMinutes, int RequiredWorkMinutes, int CalculatedOtMinutes,
    int RoundedOtMinutes, int ApprovedOtMinutes);

public record AttendanceListItem(
    int AttendanceId, int EmployeeId, string EmployeeName, string EmpCode,
    DateOnly AttendanceDate, int ShiftId, string ShiftName, string AttendanceType,
    decimal AttendanceUnits, string EntryType, int ActualWorkMinutes,
    int RequiredWorkMinutes, int CalculatedOtMinutes, int RoundedOtMinutes, int ApprovedOtMinutes);

public record AttendanceStatusRequest(string Status, decimal AttendanceUnits, string Meaning, bool IsActive);

public record OtRoundingRuleRequest(int FromMinutes, int ToMinutes, int RoundedMinutes, bool IsActive);

public record DashboardStats(
    int TotalEmployees, int ActiveEmployees, int ContractEmployees,
    List<DeptCount> ByDepartment, List<EmployeeListItem> RecentJoiners,
    DashboardAttendance TodayAttendance);

public record DashboardAttendance(
    string Date, int Present, int Absent, int HalfDay, int PaidLeave,
    int OnDuty, int Other, int TotalRecorded, int TotalWorkMinutes, int TotalOtMinutes);

public record DeptCount(string Department, int Count);
