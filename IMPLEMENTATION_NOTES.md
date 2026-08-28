# Attendance / Department / Shift Upgrade

This version builds on the existing ERP project.

## Main changes

1. Removed the Users page from the application navigation/routes.
2. Added `Role Type` and `Shift` dropdowns to Employee > Basic Details.
3. Added Departments master:
   - Department Name
   - OT Allowed
   - Minimum OT Minutes
   - Maximum OT Minutes
   - Required Work Minutes
4. Replaced the old shift-template UI with a full Shifts master:
   - Shift ID
   - Shift Code
   - Shift Name
   - Shift start/end
   - Lunch start/end
   - Grace in/out
   - Late after
   - Early out
   - Minimum / Half-day / Full-day minutes
   - OT allowed
   - OT start-after minutes
   - Night shift
   - Status
5. Added Daily Attendance Entry for HR/Admin/SuperAdmin.
6. Attendance supports an unlimited number of In/Out pairs per day (a normalized `attendance_punches` table, not a fixed column count). Values are stored as minutes for calculation and displayed as hours + minutes.
7. Added server-side time calculation:
   - Actual work = sum of punch intervals minus configured lunch overlap.
   - Required work = employee department required work minutes.
   - Calculated OT = actual - required, subject to department/shift OT policy.
   - Rounded OT = configurable rounding rule.
   - Approved OT = editable; a reason is required when it differs from rounded OT.
8. Added configurable OT rounding rules and seeded rules matching the supplied example.
9. Dashboard now includes today's attendance, work minutes and approved OT.

## Database

### New database
Run `database/schema.sql`.

### Existing database
All migrations have been folded into `database/schema.sql` and were already
applied to the live database as they were introduced — there's no longer a
`database/migrations/` folder to run separately (removed once every
environment had them applied, since running them against a database already
on the current schema would fail).

Do not run the full schema file against an existing production database because it intentionally drops and recreates tables.

## API areas

- `/api/departments`
- `/api/shifts`
- `/api/attendance`
- `/api/attendance/statuses`
- `/api/attendance/rounding-rules`
- `/api/dashboard/stats`

## Attendance design note

Five punch pairs were implemented because that matches the requested UI and keeps the attendance row compact. If biometric devices may produce many punches per day, the next scalability step should be a child `attendance_punches` table (one row per punch) while retaining a calculated summary on `attendance_entries`. That avoids a hard five-pair limit without making the normal payroll query expensive.

## Role note

`Employee.RoleType` is the employee master field requested for User/HR/Admin/SuperAdmin. It is separate from the existing authentication `users` table. The Users navigation was removed, but the authentication backend remains so existing login accounts continue to work.
