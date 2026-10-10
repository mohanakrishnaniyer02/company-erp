using ErpApi.Data;
using ErpApi.DTOs;
using ErpApi.Models;
using Microsoft.EntityFrameworkCore;

namespace ErpApi.Services;

// Actually creates an employee. Used when an "add employee" approval request is approved.
public static class EmployeeProvisioner
{
    public static async Task<(Employee? Employee, string? Error)> CreateAsync(
        AppDbContext db, IJwtService jwt, EmployeeUpsertRequest req, string? passwordHash)
    {
        if (string.IsNullOrWhiteSpace(req.FullName)) return (null, "Full name is required.");
        if (string.IsNullOrWhiteSpace(req.EmpCode)) return (null, "Employee ID is required.");
        if (await db.Employees.AnyAsync(e => e.EmpCode == req.EmpCode))
            return (null, $"Employee ID '{req.EmpCode}' is already in use.");

        var deviceId = string.IsNullOrWhiteSpace(req.BiometricDeviceEmpId) ? null : req.BiometricDeviceEmpId.Trim();
        if (deviceId != null && await db.Employees.AnyAsync(e => e.BiometricDeviceEmpId == deviceId))
            return (null, $"Biometric Device ID '{deviceId}' already belongs to another employee.");

        var roleType = string.IsNullOrWhiteSpace(req.RoleType) ? "User" : req.RoleType!;
        var hasLogin = EmployeeRules.LoginRoles.Contains(roleType);
        if (hasLogin)
        {
            if (string.IsNullOrWhiteSpace(req.Email)) return (null, "Email is required to grant HR/Admin/SuperAdmin access.");
            if (string.IsNullOrEmpty(passwordHash)) return (null, "This request has no password to set for the login account.");
            if (await db.Employees.AnyAsync(e => e.Email == req.Email && e.PasswordHash != null))
                return (null, "An account with this email already exists.");
        }

        var emp = new Employee
        {
            EmpCode = req.EmpCode,
            Type = req.Type,
            FullName = req.FullName,
            Designation = req.Designation,
            DepartmentId = req.DepartmentId,
            OrgDepartmentId = req.OrgDepartmentId,
            CompanyId = req.CompanyId,
            ManagerId = req.ManagerId,
            ShiftId = req.ShiftId,
            RoleType = roleType,
            DateOfJoining = req.DateOfJoining,
            DateOfBirth = req.DateOfBirth,
            DateOfLeaving = req.DateOfLeaving,
            LeavingComments = req.LeavingComments,
            LocationId = req.LocationId,
            Email = req.Email,
            PhoneNumber = req.PhoneNumber,
            PhotoUrl = req.PhotoUrl,
            BiometricDeviceEmpId = deviceId,
            MaritalStatus = req.MaritalStatus,
            Status = req.DateOfLeaving.HasValue ? "Inactive" : "Active"
        };
        if (hasLogin) emp.PasswordHash = passwordHash;

        db.Employees.Add(emp);
        await db.SaveChangesAsync(); // need emp.EmployeeId before the token can embed it

        if (hasLogin)
        {
            emp.JwtToken = jwt.GenerateToken(emp);
            await db.SaveChangesAsync();
        }

        var b = req.Bank;
        if (b != null && (!string.IsNullOrWhiteSpace(b.BankName) || !string.IsNullOrWhiteSpace(b.AccountNumber) || !string.IsNullOrWhiteSpace(b.IfscCode)))
        {
            db.BankDetails.Add(new BankDetail
            {
                EmployeeId = emp.EmployeeId, BankName = b.BankName, AccountNumber = b.AccountNumber, IfscCode = b.IfscCode,
                BranchName = b.BranchName, EsiNumber = b.EsiNumber, PanNumber = b.PanNumber
            });
            await db.SaveChangesAsync();
        }

        return (emp, null);
    }
}
