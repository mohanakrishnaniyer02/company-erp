namespace ErpApi.DTOs;

public record EmployeeListItem(
    int EmployeeId, string EmpCode, string FullName, string? Designation,
    string? Department, string Type, string Status, string? Location);

public record EmployeeUpsertRequest(
    string EmpCode, string Type, string FullName, string? Designation,
    int? DepartmentId, int? CompanyId, int? ManagerId,
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
    string ShiftName, TimeOnly StartTime, TimeOnly EndTime, bool IsNextDay,
    TimeOnly? Break1Start, TimeOnly? Break1End, TimeOnly? Break2Start, TimeOnly? Break2End,
    TimeOnly? LunchStart, TimeOnly? LunchEnd);

public record AssignShiftRequest(int ShiftId, DateOnly EffectiveFrom);

public record DashboardStats(
    int TotalEmployees, int ActiveEmployees, int ContractEmployees,
    List<DeptCount> ByDepartment, List<EmployeeListItem> RecentJoiners);

public record DeptCount(string Department, int Count);
