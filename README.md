# Company HR — ERP System (React + .NET + PostgreSQL)

An internal HR / attendance / payroll-support system: employee records,
department and shift masters, shift mapping, leave, attendance (manual or fetched
from a biometric machine) with automatic OT calculation and configurable
late-in / early-out rules, approvals, and a role-based dashboard.

```
erp-system/
├── database/schema.sql     ← fresh-install database setup (drops everything first!)
├── database/upgrades/      ← scripts + guide to update an EXISTING database
├── database/sample-data.sql← optional example data (safe to re-run)
├── backend/ErpApi/         ← ASP.NET Core 8 Web API
└── frontend/erp-ui/        ← React (Vite)
```

> **Prefer clicking over typing?** See [SETUP-GUI.md](./SETUP-GUI.md) for the
> same setup done entirely through pgAdmin, Visual Studio, and VS Code.
>
> **Want a live demo URL instead of running this locally?** See
> [DEPLOYMENT.md](./DEPLOYMENT.md) for deploying to Render.com.

---

## 1. Database

Run `database/schema.sql` once. That's it — it creates every table and seeds:
- 3 companies, 4 locations, 4 payroll departments, 5 departments, 2 shift templates (Day/Night)
- 8 attendance status types (Present, Absent, Half Day, Weekly Off, Holiday,
  Paid Leave, Unpaid Leave, On Duty) and their OT rounding rules
- **One working bootstrap login** (see [Authentication](#4-authentication--roles) below)

No demo companies-only setup here — the database starts with real reference
data (companies/departments/shifts/locations), a SuperAdmin login, two more
sample login accounts (HR and Admin), and a couple of plain employee records.
Add more real people through the app itself once you're in. A couple of demo Shift Mappings,
some recorded leave, and a few pending overtime entries are seeded too so the Shift Calendar, Leave and
Approvals screens have something to show.

`schema.sql` also ends with **example data** (late-in/early-out attendance, biometric punches,
pending approvals, leave, a rule ladder) so every screen has something to show. To load the same
examples into an existing database, run `database/sample-data.sql` once — it only fills blanks and
can be re-run safely.

**Already have a database with data?** Don't run `schema.sql` — it starts by dropping every
table. Follow [Updating an existing copy](#7-updating-an-existing-copy-after-pulling-from-git)
below (the scripts in [`database/upgrades/`](./database/upgrades/) keep your data and are safe to
run more than once).

## 2. Backend (.NET 8 Web API)

Requires the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
cd backend/ErpApi
dotnet restore
```

Set these via **User Secrets** (right-click the project in Visual Studio →
Manage User Secrets) rather than editing `appsettings.json` directly:
```json
{
  "Jwt:Key": "<a real random 32+ character secret>",
  "ConnectionStrings:Default": "Host=localhost;Port=5432;Database=company_erp;Username=postgres;Password=<your password>"
}
```
The app **refuses to start** if `Jwt:Key` is still the placeholder value —
this is intentional, not a bug.

```bash
dotnet run
```
Listens on `http://localhost:5205` by default (see
`Properties/launchSettings.json`). Swagger UI is at
`http://localhost:5205/swagger`.

### Biometric settings (attendance fetched from the machine)

The Attendance screen's **Entry Type = Biometric** reads the machine's punches. Where they come
from is set in `appsettings.json`:

```json
"Biometric": {
  "Source": "Local",
  "DuplicateWindowSeconds": 60,
  "SqlServer": {
    "ConnectionString": "Server=...;Database=FAS_TIMESHEET;User Id=...;Password=...;Encrypt=False;TrustServerCertificate=True",
    "Table": "dbo.Attendance_MachineData"
  }
}
```

| Setting | Meaning |
|---|---|
| `Source` = `Local` (default) | Punches come from this app's own `biometric_punches` table (the example data uses it). Nothing else needed. |
| `Source` = `SqlServer` | Punches are read, **read-only**, from the machine database's `Attendance_MachineData` (`DeviceEmpID`, `AttendanceDate`, `DeviceCapuredTime`; rows with `Recstatus='A'`). Put the real connection string in **User Secrets** (key `Biometric:SqlServer:ConnectionString`), not in the committed file. For older SQL Server versions (2008 R2) keep `Encrypt=False;TrustServerCertificate=True`. |
| `DuplicateWindowSeconds` | A scan within this many seconds of the previous kept scan is ignored (e.g. face and thumb both registering). Default 60. |

Each employee must have their **Biometric Device ID** (their number on the machine) set on the
Employee form, otherwise nothing can be matched to them. Captures alternate In, Out, In, Out…; an
odd number of captures leaves the last Out empty and the form warns you. The code that writes
punches from the device into SQL Server is separate from this app — the app only reads.

## 3. Frontend (React + Vite)

Requires [Node.js 18+](https://nodejs.org).

```bash
cd frontend/erp-ui
npm install
npm run dev
```
Opens at `http://localhost:5173`. Check `.env` — `VITE_API_BASE_URL` must
match the port your API is actually running on.

## 4. Authentication & roles

**There is no public signup page.** Every login-capable account is an
**Employee record** — login credentials (`password_hash`, `jwt_token`,
`must_change_password`) live directly on the `employees` table, not a
separate `users` table. A plain "User"-role employee simply has no password
set and cannot log in at all.

**Getting your first account**: `schema.sql` seeds a working SuperAdmin so
you're never locked out of a fresh install, plus two more login-capable
accounts (HR and Admin) so you can test the role hierarchy immediately
without creating anyone yourself:

| Role | Employee ID | Password |
|---|---|---|
| SuperAdmin | `SUPERADMIN-001` | `ChangeMe123!` |
| HR | `EMP-0002` | `ChangeMe123!` |
| Admin | `EMP-0003` | `ChangeMe123!` |

Logging in with any of these takes you straight to the Dashboard — this
password stays in effect permanently, there's no forced change on first
login. Two more plain employees (Ananya Iyer, Zoya Khan) are also seeded
with no login, so the Employees list isn't empty either.

**Creating further accounts**: an existing HR/Admin/SuperAdmin opens
**Add Employee** (or edits an existing one), sets **Role Type** to
HR/Admin/SuperAdmin, and a **Password** field appears. That password is
what the new person logs in with going forward — no forced change, though
they (or an Admin/SuperAdmin resetting it later) can always change it
voluntarily via the account menu's "Change password" option.

**Role hierarchy** — each role can create/edit accounts at its own level or
below, never above:
```
SuperAdmin > Admin > HR > User
```
A HR user cannot create or edit an Admin or SuperAdmin record, even via a
direct API call — this is enforced server-side, not just hidden in the UI.

**JWT behavior**: a token is generated **once**, when login access is
granted, and reused for every subsequent login by that person — not
regenerated each time. It only gets reissued if that person's role changes
later (since role is embedded in the token). There is no refresh-token flow.
Token lifetime is set in `appsettings.json` under `Jwt:ExpiryMinutes`
(currently ~1 year, since there's no refresh flow to fall back on).

## 5. What's in the app

| Module | What it does |
|---|---|
| **Employees** | List, search, filter by Regular/Contract and Role Type. Add/Edit covers Basic Details (incl. Role Type, Department, Shift), Bank Details, Proof/Documents, Address, Education. **Adding an employee and deactivating one are requests** that an Admin or SuperAdmin must approve (see Approvals below); editing an existing employee stays immediate |
| **Departments** | Two tabs. **Payroll Departments**: name, OT allowed, min/max OT time, required work hours per day (drives attendance calculation; feeds the *Payroll Department* dropdown on Employee). **Departments**: a simple name list of the organisational departments (feeds the *Department* dropdown on Employee) |
| **Shifts** | Master data: timing, lunch, grace in/out, minimum/half-day/full-day minutes, OT-starts-after, night-shift flag. (Whether OT is allowed is set on the Payroll Department, not here.) Feeds the Shift dropdown on Employee |
| **Shift Mapping** | Put an employee on a different shift for a date range (Start Date, End Date, Employee, Shift) — e.g. a General-shift employee covering a week of nights. Overlapping ranges for one employee are rejected. The Attendance screen picks up the mapped shift for the date, otherwise the employee's own shift |
| **Shift Calendar** | Teams-style month view: for each day, how many employees are on each shift (colour-coded). Click a day to see who; filter by Department |
| **Attendance** | One screen to view and record attendance. **View** by Day, Month or a date Range, filtered by Department: In Time, Out Time, Break, Work Hrs and OT Hrs per person; click a Break to see the punches and when each break was taken; late-in / early-out flagged. In Day view, people with no entry yet show as *Not entered* with a one-click **Add**. **Add Entry**: shift, attendance type and any number of In/Out pairs, with automatic work/OT calculation. **Entry Type = Biometric** fetches the day's punches from the biometric machine data (duplicate scans ignored) and fills the form; press Save to keep them. An **Apply attendance rules** box applies the late-in / early-out ladder (see Attendance Rules). |
| **Attendance Rules** *(Admin and SuperAdmin)* | Per-Department ladders for lateness: at least N minutes late, Nth time in the month, deduct Permission / Casual / Sick, Loss of Pay or just warn; what to do when the balance is too low. Applied only when HR ticks the box on an entry |
| **Leave** | Select an employee and a date to see their balances, then record leave taken with **Add Leave**. Balances come from policy automatically — nobody grants them: **Sick Leave** 6 days per calendar year (whole days), **Casual Leave** 1 day per month (0.5 or 1), **Permission** 120 minutes per month. Each period stands alone — unused leave lapses, nothing carries forward. Over-balance requests are rejected, and at most one day of leave can be recorded per date. Admin/SuperAdmin also get **Adjust balance** (reason required) for exceptions, and can remove adjustments; HR can remove leave they recorded by mistake |
| **Approvals** *(Admin and SuperAdmin only — hidden from everyone else)* | A sidebar group with two screens, each with a pending-count badge. **Employee Approvals**: requests to add or deactivate an employee, showing the essential details with ✓ Approve / ✕ Reject. An added employee only exists once approved (a login password is stored only as a hash while waiting); a deactivation leaves the employee Active until approved. An approver can't approve a request above their own role (an Admin can't approve adding or deactivating a SuperAdmin) but may approve a request they raised themselves. **OT Approvals**: overtime waiting for a decision — the approver can change the minutes (up to the OT actually worked; a note is required if it differs from the rounded figure) before approving, or reject it. If attendance is saved again with different OT it goes back to pending |
| **Dashboard** | Headcount KPIs (total/active/contract, today's present count and approved OT), plus an **Attendance Explorer** — pick a month and browse either a company-wide summary or one employee's full day-by-day record |

All time values are stored in minutes internally and displayed in hours for
readability.

## 6. Deleting or deactivating an employee

Delete is a **soft delete** by default — sets the employee `Inactive` and
stamps a leaving date, doesn't remove the row (HR systems need to retain
historical records). A hard delete exists (`DELETE /api/employees/{id}?hard=true`)
but is restricted to SuperAdmin only.

## 7. Updating an existing copy (after pulling from git)

For anyone who already runs an earlier copy of this project and just pulled/extracted the newest
version. Details and per-script notes: [`database/upgrades/README.md`](./database/upgrades/README.md).

1. **Back up the database.** pgAdmin: right-click the database → **Backup…**. Or by SQL — open a
   Query Tool on the **postgres** database (not `company_erp`), and run these **one at a time**
   with the app stopped:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = 'company_erp' AND pid <> pg_backend_pid();
   ```
   ```sql
   CREATE DATABASE company_erp_backup_YYYYMMDD TEMPLATE company_erp;
   ```
2. **Stop** the backend (Visual Studio) and the frontend dev server.
3. **Get the new files**: `git pull` (or extract the zip over the folder). Your User Secrets
   (JWT key, connection string) live outside the project and are untouched.
4. **Run the upgrade scripts in order** on `company_erp` (pgAdmin → Query Tool → open file → F5).
   Each is safe to repeat, so if unsure which you already ran, run all five:
   `2026-10-batch1-…`, `batch2-leave`, `batch3-approvals`, `batch4-attendance-rules`, `batch5-biometric`.
   **Never run `schema.sql`** on a database you want to keep.
5. *(Optional)* run `database/sample-data.sql` once for example entries.
6. **Backend:** Visual Studio → **Build → Rebuild Solution** (this restores the new
   `Microsoft.Data.SqlClient` package) → F5. Add the `Biometric` section to your own
   `appsettings.json` if it is missing (see section 2).
7. **Frontend:** VS Code → run **Install Dependencies** (harmless if unchanged) and **Start Dev
   Server**; hard-refresh the browser (**Ctrl + F5**).
8. Log in (Employee ID + password unchanged) and set each employee's **Biometric Device ID**.
9. As Admin/SuperAdmin, review **Attendance Rules**; employees need a Department for rules to apply.

Good to know: existing attendance rows show 0 late/early minutes until re-saved; Loss-of-Pay and
warnings from the rules are recorded in the rule log and do not change an attendance status.
