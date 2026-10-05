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
