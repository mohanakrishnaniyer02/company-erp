# Design notes

How the pieces fit together. For setup see `README.md`; for deployment see `DEPLOYMENT.md`.

## Two kinds of "department"

- **Payroll Department** (`departments` table, Departments → *Payroll Departments* tab) —
  carries the payroll rules: whether OT is allowed, minimum/maximum OT, and the required
  work minutes per day. Attendance calculation reads these. On the employee it's the
  *Payroll Department* field (`employees.department_id`).
- **Department** (`org_departments` table, Departments → *Departments* tab) — just a name:
  the organisational department an employee belongs to (`employees.org_department_id`).
  Used for grouping/filtering (e.g. the Shift Calendar and Shift Mapping pickers).
  The Attendance screens still filter by Payroll Department.

## Shifts

A shift has: code, name, start/end, lunch start/end, grace in/out, minimum / half-day /
full-day minutes, "OT starts after" minutes, night-shift flag, status. Whether OT is
allowed at all is **not** a shift setting — that comes from the employee's Payroll
Department. (Late-after and early-out were dropped; grace in/out covers them.)

### Which shift applies on a given day

1. A **Shift Mapping** covering that date for that employee (start/end dates inclusive), else
2. the employee's own shift (`employees.shift_id`, their first-allocated/default shift), else
3. none.

Mappings for the same employee may not overlap. The Daily Attendance modal resolves the
shift this way when you pick an employee and date (and says whether it was mapped or the
default); the Shift Calendar uses the same rule, restricted to days the employee has
joined and not yet left.

## Attendance calculation (server side, `AttendanceController`)

- **Punches** are stored one row per In/Out pair in `attendance_punches`, under a single
  `attendance_entries` row per employee per day (`UNIQUE(employee_id, attendance_date)`).
  There is no fixed limit on pairs.
- **Actual work** = sum of each pair's duration, minus the overlap of that pair with the
  shift's lunch window. A gap *between* pairs is simply never counted, so a longer-than-
  scheduled lunch is captured by entering two pairs; the shift's lunch window only acts as
  the fallback for a single continuous pair.
- **Required work** = the Payroll Department's required minutes (shift full-day minutes if
  none).
- **Calculated OT** = actual − required, forced to 0 if the Payroll Department disallows OT
  or the amount is under the shift's "OT starts after", raised to 0 if under the
  department's minimum OT, and capped at its maximum OT.
- **Rounded OT** = the configurable `ot_rounding_rules` row covering the calculated OT.
- **OT status**: any rounded OT above zero starts `PENDING` and counts for nothing until an
  Admin/SuperAdmin decides it (see *Approvals*). Approved OT is what the approver entered
  (they may edit the minutes, at most the OT actually worked; a note is required if it differs
  from the rounded figure). Rejected OT is skipped. Re-saving an entry keeps an earlier decision
  only if the OT itself didn't change; otherwise it's pending again.
- **Counted work** (`counted_work_minutes`) = min(actual, required) + approved OT. This is what
  the *Work Hrs* column and the dashboard totals show; the raw punched time stays in
  `actual_work_minutes`.
- Everything is stored in minutes and shown as hours + minutes. The *Break* column on the
  Attendance screen is raw punch time minus actual work, so it reflects whichever mechanism
  (explicit gap or shift lunch) removed the time.

## Leave

Balances are **derived, never stored**. `leave_types` holds the policy (Sick 6 days/year,
Casual 1 day/month in 0.5 steps, Permission 120 minutes/month) and `leave_entries` records
only what happened: `TAKEN` (positive, deducts) or `ADJUST` (signed, reason required —
for exceptions). For any date, the balance is the entitlement of the period containing it
(calendar year for Sick, month for Casual/Permission) plus adjustments minus leave taken
in that same period, so every employee always has the right entitlement with no one
granting it. Entitlement is the full allowance if the employee was employed at any point
in the period (no proration).

- **No carry forward** — each period stands alone; unused leave lapses. Carry-forward was
  deliberately left out ("not clear yet"); adding it later means changing how a period's
  entitlement is computed in `LeaveRules`, not the tables.
- Leave can't exceed the remaining balance, must be in steps (`step` in `leave_types`:
  1 day / 0.5 day / 1 minute), and at most one day of leave can be recorded per date
  across the day-based types. The rules live in `Services/LeaveRules.cs`, free of database
  access.
- Recording leave does **not** touch attendance — the two are separate for now.
- A multi-day sick leave is recorded one date at a time.

## Approvals

Only Admin and SuperAdmin can see or use these (enforced in the API, not just the menu).

- **Employees** — `POST /api/employees` and `DELETE /api/employees/{id}` no longer act directly;
  they create a row in `approval_requests` (`EMPLOYEE_ADD` / `EMPLOYEE_DELETE`). For an add, the
  full employee details (and bank details) sit in the row's JSON `payload`, with the login
  password already hashed — the plain password is never stored. Approving an add creates the
  employee, in one transaction with marking the request approved; approving a delete sets the
  employee Inactive and stamps today as the leaving date. Both are re-checked at approval time
  (the employee ID may have been taken in the meantime).
- **Hierarchy** — you can't approve a request above your own role (`EmployeeRules.CanManage`), the
  same rule that already limits who can create or edit whom. An approver *may* approve their own
  request, otherwise a lone SuperAdmin could never add anyone.
- **Not gated** — editing an existing employee and reactivating one stay immediate. Marking
  someone as leaving by typing a leaving date into the edit form is refused (it would sidestep
  the deactivation approval); use Delete. `?hard=true` (a real delete, SuperAdmin only) is API-only,
  not in the UI, and not subject to approval.
- **Overtime** — see *Attendance calculation*. `GET /api/approvals/overtime` lists entries by OT
  status; `approve` takes optional `approvedMinutes` and `note`, `reject` an optional `note`.
- There is no notification back to the person who raised a request — they see the result on the
  Employees list (a deactivation shows "pending" until decided; an added employee appears once approved).

## Attendance rules (late in / early out)

- **Detection** (`AttendanceRules`): measured against the shift that applies on the date. Late In = first
  complete punch-in minus shift start; Early Out = shift end minus last complete punch-out. Within the shift's
  Grace In / Grace Out it counts as on time (0); past it, the *full* time counts (not just the part beyond the
  grace). Night shifts work because clock differences are folded into +/-12h. The two values are stored on every
  attendance entry (`late_in_minutes`, `early_out_minutes`) whenever it is saved.
- **Rule sets** (Admin/SuperAdmin page *Attendance Rules*): one ladder per org Department per check (Late In or
  Early Out); a ladder with no Department is "All Departments" and is used when the employee's Department has no
  active ladder of its own. Only one active ladder per Department per check.
- **Steps**: threshold (minutes), occurrence number, action, and what to do when the balance is too low. Actions:
  Permission (minutes), Casual / Sick / Loss of Pay (days), or a warning. For each occurrence the highest
  threshold met wins; past the last defined occurrence the last one repeats. Below every threshold nothing is
  applied and nothing is counted. Low-balance options: use what is left then charge the fallback (default), use
  only what is left, skip to the fallback, or warn only. If a fallback Casual/Sick balance is also short, the
  fallback becomes Loss of Pay.
- **Occurrence** = how many times rules were already applied to that employee for the same check in the current
  month (or year, per rule set) + 1. It counts applications on other entries regardless of date, so back-dating
  an entry does not renumber later ones.
- **Applying**: HR+ ticks *Apply attendance rules* in the attendance modal (pre-ticked on a new entry when a rule
  matches). Saving replaces whatever was applied to that entry before, so unticking waives it; deleting the entry
  gives the deductions back. Permission / Casual / Sick deductions are ordinary `leave_entries` (kind TAKEN), so
  Leave balances stay derived. Loss of Pay and warnings are recorded in `attendance_rule_charges` only;
  attendance status is not changed automatically.

## Database

- **New database:** run `database/schema.sql` only.
- **Existing database you want to keep:** run the scripts in `database/upgrades/` for the
  batches you're missing (see the README in that folder). Never run `schema.sql` on a
  database with data you care about — it drops and recreates every table.

## API areas

`/api/auth`, `/api/employees`, `/api/departments` (payroll), `/api/org-departments`,
`/api/approvals` (+ `/summary`, `/employees`, `/overtime`), `/api/shifts`, `/api/shift-mappings` (+ `/resolve`, `/calendar`), `/api/attendance-rules` (+ `/preview`, `/applied/{id}`), `/api/leave` (+ `/types`, `/balances`, `/entries`, `/adjustments`), `/api/attendance`
(+ `/statuses`, `/rounding-rules`, `/calculate`), `/api/dashboard/stats`.
