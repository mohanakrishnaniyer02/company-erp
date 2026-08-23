using ErpApi.Models;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<BankDetail> BankDetails => Set<BankDetail>();
    public DbSet<ProofDocument> ProofDocuments => Set<ProofDocument>();
    public DbSet<EmployeeAddress> EmployeeAddresses => Set<EmployeeAddress>();
    public DbSet<EmployeeEducation> EmployeeEducations => Set<EmployeeEducation>();
    public DbSet<ShiftTemplate> ShiftTemplates => Set<ShiftTemplate>();
    public DbSet<EmployeeShiftAssignment> ShiftAssignments => Set<EmployeeShiftAssignment>();
    public DbSet<AttendanceStatus> AttendanceStatuses => Set<AttendanceStatus>();
    public DbSet<OtRoundingRule> OtRoundingRules => Set<OtRoundingRule>();
    public DbSet<AttendanceEntry> AttendanceEntries => Set<AttendanceEntry>();
    public DbSet<AttendancePunch> AttendancePunches => Set<AttendancePunch>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.FullName).HasColumnName("full_name");
            e.Property(x => x.Email).HasColumnName("email");
            e.Property(x => x.PasswordHash).HasColumnName("password_hash");
            e.Property(x => x.Role).HasColumnName("role");
            e.Property(x => x.JwtToken).HasColumnName("jwt_token");
            e.Property(x => x.MustChangePassword).HasColumnName("must_change_password");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.Email).IsUnique();
        });

        modelBuilder.Entity<Company>(e =>
        {
            e.ToTable("companies");
            e.HasKey(x => x.CompanyId);
            e.Property(x => x.CompanyId).HasColumnName("company_id");
            e.Property(x => x.CompanyName).HasColumnName("company_name");
            e.Property(x => x.IsSubCompany).HasColumnName("is_sub_company");
            e.Property(x => x.ParentCompanyId).HasColumnName("parent_company_id");
        });

        modelBuilder.Entity<Location>(e =>
        {
            e.ToTable("locations");
            e.HasKey(x => x.LocationId);
            e.Property(x => x.LocationId).HasColumnName("location_id");
            e.Property(x => x.LocationName).HasColumnName("location_name");
        });

        modelBuilder.Entity<Department>(e =>
        {
            e.ToTable("departments");
            e.HasKey(x => x.DepartmentId);
            e.Property(x => x.DepartmentId).HasColumnName("department_id");
            e.Property(x => x.DepartmentName).HasColumnName("department_name");
            e.Property(x => x.OtAllowed).HasColumnName("ot_allowed");
            e.Property(x => x.MinOtMinutes).HasColumnName("min_ot_minutes");
            e.Property(x => x.MaxOtMinutes).HasColumnName("max_ot_minutes");
            e.Property(x => x.RequiredWorkMinutes).HasColumnName("required_work_minutes");
        });

        modelBuilder.Entity<Employee>(e =>
        {
            e.ToTable("employees");
            e.HasKey(x => x.EmployeeId);
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.EmpCode).HasColumnName("emp_code");
            e.Property(x => x.Type).HasColumnName("type");
            e.Property(x => x.FullName).HasColumnName("full_name");
            e.Property(x => x.Designation).HasColumnName("designation");
            e.Property(x => x.DepartmentId).HasColumnName("department_id");
            e.Property(x => x.CompanyId).HasColumnName("company_id");
            e.Property(x => x.ManagerId).HasColumnName("manager_id");
            e.Property(x => x.ShiftId).HasColumnName("shift_id");
            e.Property(x => x.RoleType).HasColumnName("role_type");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.DateOfJoining).HasColumnName("date_of_joining");
            e.Property(x => x.DateOfBirth).HasColumnName("date_of_birth");
            e.Property(x => x.DateOfLeaving).HasColumnName("date_of_leaving");
            e.Property(x => x.LeavingComments).HasColumnName("leaving_comments");
            e.Property(x => x.LocationId).HasColumnName("location_id");
            e.Property(x => x.Email).HasColumnName("email");
            e.Property(x => x.PhoneNumber).HasColumnName("phone_number");
            e.Property(x => x.PhotoUrl).HasColumnName("photo_url");
            e.Property(x => x.MaritalStatus).HasColumnName("marital_status");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.EmpCode).IsUnique();

            e.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId);
            e.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId);
            e.HasOne(x => x.LocationRef).WithMany().HasForeignKey(x => x.LocationId);
            e.HasOne(x => x.Manager).WithMany().HasForeignKey(x => x.ManagerId);
            e.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
            e.HasOne(x => x.User).WithOne().HasForeignKey<Employee>(x => x.UserId);
            e.HasIndex(x => x.UserId).IsUnique();
        });

        modelBuilder.Entity<BankDetail>(e =>
        {
            e.ToTable("employee_bank_details");
            e.HasKey(x => x.BankDetailId);
            e.Property(x => x.BankDetailId).HasColumnName("bank_detail_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.BankName).HasColumnName("bank_name");
            e.Property(x => x.AccountNumber).HasColumnName("account_number");
            e.Property(x => x.IfscCode).HasColumnName("ifsc_code");
            e.Property(x => x.BranchName).HasColumnName("branch_name");
            e.Property(x => x.EsiNumber).HasColumnName("esi_number");
            e.Property(x => x.PanNumber).HasColumnName("pan_number");
            e.HasIndex(x => x.EmployeeId).IsUnique();
            e.HasOne(x => x.Employee).WithOne(x => x.BankDetail).HasForeignKey<BankDetail>(x => x.EmployeeId);
        });

        modelBuilder.Entity<ProofDocument>(e =>
        {
            e.ToTable("employee_proof");
            e.HasKey(x => x.ProofId);
            e.Property(x => x.ProofId).HasColumnName("proof_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.ProofType).HasColumnName("proof_type");
            e.Property(x => x.ProofNumber).HasColumnName("proof_number");
            e.Property(x => x.AttachmentUrl).HasColumnName("attachment_url");
            e.HasOne(x => x.Employee).WithMany(x => x.ProofDocuments).HasForeignKey(x => x.EmployeeId);
        });

        modelBuilder.Entity<EmployeeAddress>(e =>
        {
            e.ToTable("employee_address");
            e.HasKey(x => x.AddressId);
            e.Property(x => x.AddressId).HasColumnName("address_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.AddressType).HasColumnName("address_type");
            e.Property(x => x.AddressLine1).HasColumnName("address_line1");
            e.Property(x => x.AddressLine2).HasColumnName("address_line2");
            e.Property(x => x.AddressLine3).HasColumnName("address_line3");
            e.Property(x => x.EmergencyPerson).HasColumnName("emergency_person");
            e.Property(x => x.EmergencyContactNumber).HasColumnName("emergency_contact_number");
            e.HasIndex(x => new { x.EmployeeId, x.AddressType }).IsUnique();
            e.HasOne(x => x.Employee).WithMany(x => x.Addresses).HasForeignKey(x => x.EmployeeId);
        });

        modelBuilder.Entity<EmployeeEducation>(e =>
        {
            e.ToTable("employee_education");
            e.HasKey(x => x.EducationId);
            e.Property(x => x.EducationId).HasColumnName("education_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.InstitutionName).HasColumnName("institution_name");
            e.Property(x => x.Degree).HasColumnName("degree");
            e.Property(x => x.CompletionDate).HasColumnName("completion_date");
            e.HasOne(x => x.Employee).WithMany(x => x.Education).HasForeignKey(x => x.EmployeeId);
        });

        modelBuilder.Entity<ShiftTemplate>(e =>
        {
            e.ToTable("shift_templates");
            e.HasKey(x => x.ShiftId);
            e.Property(x => x.ShiftId).HasColumnName("shift_id");
            e.Property(x => x.ShiftCode).HasColumnName("shift_code");
            e.Property(x => x.ShiftName).HasColumnName("shift_name");
            e.Property(x => x.StartTime).HasColumnName("shift_start_time");
            e.Property(x => x.EndTime).HasColumnName("shift_end_time");
            e.Property(x => x.LunchStartTime).HasColumnName("lunch_start_time");
            e.Property(x => x.LunchEndTime).HasColumnName("lunch_end_time");
            e.Property(x => x.GraceInMinutes).HasColumnName("grace_in_minutes");
            e.Property(x => x.GraceOutMinutes).HasColumnName("grace_out_minutes");
            e.Property(x => x.LateAfterMinutes).HasColumnName("late_after_minutes");
            e.Property(x => x.EarlyOutMinutes).HasColumnName("early_out_minutes");
            e.Property(x => x.MinimumWorkMinutes).HasColumnName("minimum_work_minutes");
            e.Property(x => x.HalfDayMinutes).HasColumnName("half_day_minutes");
            e.Property(x => x.FullDayMinutes).HasColumnName("full_day_minutes");
            e.Property(x => x.OtAllowed).HasColumnName("ot_allowed");
            e.Property(x => x.OtStartAfterMinutes).HasColumnName("ot_start_after_minutes");
            e.Property(x => x.IsNightShift).HasColumnName("is_night_shift");
            e.Property(x => x.Status).HasColumnName("status");
            e.HasIndex(x => x.ShiftCode).IsUnique();
        });

        modelBuilder.Entity<EmployeeShiftAssignment>(e =>
        {
            e.ToTable("employee_shift_assignment");
            e.HasKey(x => x.AssignmentId);
            e.Property(x => x.AssignmentId).HasColumnName("assignment_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.ShiftId).HasColumnName("shift_id");
            e.Property(x => x.EffectiveFrom).HasColumnName("effective_from");
            e.HasOne(x => x.Employee).WithMany(x => x.ShiftAssignments).HasForeignKey(x => x.EmployeeId);
            e.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
        });


        modelBuilder.Entity<AttendanceStatus>(e =>
        {
            e.ToTable("attendance_statuses");
            e.HasKey(x => x.AttendanceStatusId);
            e.Property(x => x.AttendanceStatusId).HasColumnName("attendance_status_id");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.AttendanceUnits).HasColumnName("attendance_units").HasPrecision(5, 2);
            e.Property(x => x.Meaning).HasColumnName("meaning");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.HasIndex(x => x.Status).IsUnique();
        });

        modelBuilder.Entity<OtRoundingRule>(e =>
        {
            e.ToTable("ot_rounding_rules");
            e.HasKey(x => x.OtRoundingRuleId);
            e.Property(x => x.OtRoundingRuleId).HasColumnName("ot_rounding_rule_id");
            e.Property(x => x.FromMinutes).HasColumnName("from_minutes");
            e.Property(x => x.ToMinutes).HasColumnName("to_minutes");
            e.Property(x => x.RoundedMinutes).HasColumnName("rounded_minutes");
            e.Property(x => x.IsActive).HasColumnName("is_active");
        });

        modelBuilder.Entity<AttendanceEntry>(e =>
        {
            e.ToTable("attendance_entries");
            e.HasKey(x => x.AttendanceId);
            e.Property(x => x.AttendanceId).HasColumnName("attendance_id");
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.AttendanceDate).HasColumnName("attendance_date");
            e.Property(x => x.ShiftId).HasColumnName("shift_id");
            e.Property(x => x.AttendanceStatusId).HasColumnName("attendance_status_id");
            e.Property(x => x.EntryType).HasColumnName("entry_type");
            e.Property(x => x.ActualWorkMinutes).HasColumnName("actual_work_minutes");
            e.Property(x => x.RequiredWorkMinutes).HasColumnName("required_work_minutes");
            e.Property(x => x.CalculatedOtMinutes).HasColumnName("calculated_ot_minutes");
            e.Property(x => x.RoundedOtMinutes).HasColumnName("rounded_ot_minutes");
            e.Property(x => x.ApprovedOtMinutes).HasColumnName("approved_ot_minutes");
            e.Property(x => x.Reason).HasColumnName("reason");
            e.Property(x => x.CreatedByUserId).HasColumnName("created_by_user_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => new { x.EmployeeId, x.AttendanceDate }).IsUnique();
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId);
            e.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
            e.HasOne(x => x.AttendanceStatus).WithMany().HasForeignKey(x => x.AttendanceStatusId);
        });

        modelBuilder.Entity<AttendancePunch>(e =>
        {
            e.ToTable("attendance_punches");
            e.HasKey(x => x.PunchId);
            e.Property(x => x.PunchId).HasColumnName("punch_id");
            e.Property(x => x.AttendanceId).HasColumnName("attendance_id");
            e.Property(x => x.SequenceNo).HasColumnName("sequence_no");
            e.Property(x => x.PunchIn).HasColumnName("punch_in");
            e.Property(x => x.PunchOut).HasColumnName("punch_out");
            e.HasIndex(x => new { x.AttendanceId, x.SequenceNo }).IsUnique();
            e.HasOne(x => x.AttendanceEntry).WithMany(x => x.Punches)
                .HasForeignKey(x => x.AttendanceId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
