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
            e.Property(x => x.ShiftName).HasColumnName("shift_name");
            e.Property(x => x.StartTime).HasColumnName("start_time");
            e.Property(x => x.EndTime).HasColumnName("end_time");
            e.Property(x => x.IsNextDay).HasColumnName("is_next_day");
            e.Property(x => x.Break1Start).HasColumnName("break1_start");
            e.Property(x => x.Break1End).HasColumnName("break1_end");
            e.Property(x => x.Break2Start).HasColumnName("break2_start");
            e.Property(x => x.Break2End).HasColumnName("break2_end");
            e.Property(x => x.LunchStart).HasColumnName("lunch_start");
            e.Property(x => x.LunchEnd).HasColumnName("lunch_end");
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
    }
}
