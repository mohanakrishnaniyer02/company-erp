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
- **Approved OT** = editable; a reason is required when it differs from rounded OT.
- Everything is stored in minutes and shown as hours + minutes. The *Break* column on the
  Attendance screen is raw punch time minus actual work, so it reflects whichever mechanism
  (explicit gap or shift lunch) removed the time.

## Database

- **New database:** run `database/schema.sql` only.
- **Existing database you want to keep:** run the scripts in `database/upgrades/` for the
  batches you're missing (see the README in that folder). Never run `schema.sql` on a
  database with data you care about — it drops and recreates every table.

## API areas

`/api/auth`, `/api/employees`, `/api/departments` (payroll), `/api/org-departments`,
`/api/shifts`, `/api/shift-mappings` (+ `/resolve`, `/calendar`), `/api/attendance`
(+ `/statuses`, `/rounding-rules`, `/calculate`), `/api/dashboard/stats`.
