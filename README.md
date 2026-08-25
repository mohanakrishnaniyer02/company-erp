# Company HR — ERP System (React + .NET + PostgreSQL)

An internal HR / attendance / payroll-support system: employee records,
department and shift masters, daily attendance entry with automatic OT
calculation, and a role-based dashboard.

```
erp-system/
├── database/
│   ├── schema.sql          ← fresh install: run this alone, nothing else
│   └── migrations/         ← only for upgrading an existing database
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

**Fresh install** (no existing data): run `database/schema.sql` once. That's
it — it creates every table and seeds:
- 3 companies, 4 locations, 4 departments, 2 shift templates (Day/Night)
- 8 attendance status types (Present, Absent, Half Day, Weekly Off, Holiday,
  Paid Leave, Unpaid Leave, On Duty) and their OT rounding rules
- 5 sample employees
- **One working bootstrap login** (see [Authentication](#4-authentication--roles) below)

**Upgrading an existing database**: run every file in
`database/migrations/`, in filename order (they're dated). Each is
idempotent-safe to re-run and documents what it does at the top.

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

**Getting your first account**: `schema.sql` seeds exactly one working
SuperAdmin so you're never locked out of a fresh install:
```
Email:    superadmin@company.co
Password: ChangeMe123!
```
Logging in with this forces an immediate password change before anything
else is reachable — this is deliberate, not a bug.

**Creating further accounts**: an existing HR/Admin/SuperAdmin opens
**Add Employee** (or edits an existing one), sets **Role Type** to
HR/Admin/SuperAdmin, and a **Password** field appears. That password is
temporary too — the new person is forced to change it on their first login.

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
| **Employees** | List, search, filter by Regular/Contract and Role Type. Add/Edit covers Basic Details (incl. Role Type, Department, Shift), Bank Details, Proof/Documents, Address, Education |
| **Departments** | Master data: name, OT allowed, min/max OT time, required work hours per day. Feeds the Department dropdown on Employee |
| **Shifts** | Master data: timing, grace/late/early-out rules, minimum/half-day/full-day minutes, OT rules, night-shift flag. Feeds the Shift dropdown on Employee |
| **Daily Attendance Entry** | HR/Admin/SuperAdmin record each employee's day: shift, attendance type, and an unlimited number of In/Out punch pairs (add as many as actually happened — no fixed cap). Automatically calculates actual work, required work (from Department), calculated OT, and rounded OT (floor to nearest 30 minutes); Approved OT is editable with a required reason if it differs from the rounded value |
| **Dashboard** | Headcount KPIs (total/active/contract, today's present count and approved OT), plus an **Attendance Explorer** — pick a month and browse either a company-wide summary or one employee's full day-by-day record |

All time values are stored in minutes internally and displayed in hours for
readability.

## 6. Deleting or deactivating an employee

Delete is a **soft delete** by default — sets the employee `Inactive` and
stamps a leaving date, doesn't remove the row (HR systems need to retain
historical records). A hard delete exists (`DELETE /api/employees/{id}?hard=true`)
but is restricted to SuperAdmin only.
