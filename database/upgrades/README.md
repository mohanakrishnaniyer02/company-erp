# Database upgrade scripts

These are for a database that is **already running** and has data you want to
keep. Run the file(s) for each batch you're upgrading through, in order, in
pgAdmin's Query Tool. Each script is safe to run more than once.

A **brand-new** database never needs anything in this folder — `../schema.sql`
already contains every change. And never run `schema.sql` on a database you want
to keep: it starts by dropping every table.

| Script | Adds |
|---|---|
| `2026-10-batch1-departments-and-shift-mapping.sql` | Department list, Shift Mapping, removes the shift OT-Allowed / Late After / Early Out columns |
| `2026-10-batch2-leave.sql` | Leave policy (`leave_types`) and recorded leave (`leave_entries`) for the Leave screen. Run after batch 1 (the app expects both) |
| `2026-10-batch3-approvals.sql` | Approval requests for employee add/delete, and OT-approval columns on attendance. Existing attendance is carried across as already decided. Run after batches 1 and 2 |
| `2026-10-batch4-attendance-rules.sql` | Late/early minutes on attendance, the attendance-rule tables, and one example late-in ladder. Run after batches 1-3 |
| `2026-10-batch5-biometric.sql` | `employees.biometric_device_emp_id` (the employee's number on the machine) and the `biometric_punches` table. Run after batches 1-4 |

## Step by step: bringing an existing database and app up to date

Do these in order. (Skipped batches are fine to catch up on — just run the missing scripts in
the table's order. Every script is safe to run more than once.)

1. **Back up first.** In pgAdmin: right-click your database → **Backup…** → give it a file name →
   **Backup**. If anything surprises you, that file gets you back.
   *Alternative, in SQL:* open a Query Tool on the **postgres** database (not your app database), with
   the app stopped, and run these **one statement at a time**:
   `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='company_erp' AND pid <> pg_backend_pid();`
   then `CREATE DATABASE company_erp_backup_YYYYMMDD TEMPLATE company_erp;`
   To go back: terminate connections again, `DROP DATABASE company_erp;`, then
   `CREATE DATABASE company_erp TEMPLATE company_erp_backup_YYYYMMDD;`.
2. **Stop the running app** (the backend in Visual Studio and the frontend dev server).
3. **Run the upgrade scripts, oldest first.** In pgAdmin: select your database → **Tools → Query
   Tool** → open the first script (folder icon, or paste its contents) → press **F5**. Wait for
   *Query returned successfully*, then do the same for the next script. **Never run `schema.sql`.**
4. **Extract the new project zip over your existing folder** (same as every earlier update).
5. **Backend:** open the solution in Visual Studio → **Build → Rebuild Solution** → press **F5**.
6. **Frontend:** in VS Code run the **Start Dev Server** task, then hard-refresh the browser
   (**Ctrl + F5**).
7. Log in (Employee ID + password, unchanged) and check the new screens. If you will use the biometric
   machine data, check the `Biometric` section of `appsettings.json` (README section 2) and set each
   employee's **Biometric Device ID**.
8. **Optional: example data.** If you want sample attendance, biometric punches, approvals and so on to look at,
   run `../sample-data.sql` once in the Query Tool (after the scripts above). It only fills in blanks and never
   overwrites your own entries, and running it twice changes nothing more. A fresh `schema.sql` install already
   includes it.

