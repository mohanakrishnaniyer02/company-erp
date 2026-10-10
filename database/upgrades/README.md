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

## Step by step: bringing an existing database and app up to date

Do these in order. (Skipped batches are fine to catch up on — just run the missing scripts in
the table's order. Every script is safe to run more than once.)

1. **Back up first.** In pgAdmin: right-click your database → **Backup…** → give it a file name →
   **Backup**. If anything surprises you, that file gets you back.
2. **Stop the running app** (the backend in Visual Studio and the frontend dev server).
3. **Run the upgrade scripts, oldest first.** In pgAdmin: select your database → **Tools → Query
   Tool** → open the first script (folder icon, or paste its contents) → press **F5**. Wait for
   *Query returned successfully*, then do the same for the next script. **Never run `schema.sql`.**
4. **Extract the new project zip over your existing folder** (same as every earlier update).
5. **Backend:** open the solution in Visual Studio → **Build → Rebuild Solution** → press **F5**.
6. **Frontend:** in VS Code run the **Start Dev Server** task, then hard-refresh the browser
   (**Ctrl + F5**).
7. Log in (Employee ID + password, unchanged) and check the new screens.

