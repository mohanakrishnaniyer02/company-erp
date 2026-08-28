# ⚠️ Do not run these on a fresh/new database

These files are for upgrading a database that was already running an
**older** version of this app before `schema.sql` caught up to include every
change (attendance, departments, shifts, the users→employees merge, etc.).

**Setting up a brand-new database?** Run `../schema.sql` **only** — it
already contains everything these migrations would add. Running any file in
this folder against a fresh install will fail (several of them reference a
`users` table that no longer exists once you've run the current `schema.sql`,
since that table was merged into `employees`).

**Upgrading an existing, already-running database?** Run every file here, in
filename order (they're dated), skipping none.
