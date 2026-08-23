-- Merge the separate `users` table into `employees` — one row per person,
-- instead of splitting login-capable people across two tables joined by
-- employees.user_id. Login fields (password_hash, jwt_token,
-- must_change_password) move onto employees directly and are simply NULL
-- for plain "User"-role employees who never get application access.
--
-- This migration is careful to lose nothing:
--   - Any employee already linked to a users row gets that row's auth data
--     copied onto it.
--   - Any users row with NO linked employee (a legacy account from before
--     Employee-linking existed, e.g. created via the old Signup page) gets
--     a new minimal employee record created for it, so nobody's login
--     silently disappears.
--   - attendance_entries.created_by_user_id is remapped from the old
--     users.user_id space into the new employees.employee_id space.
--
-- Safe to run once against your existing database.

BEGIN;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS jwt_token TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Copy auth data onto employees that are already linked to a users row.
UPDATE employees e
SET password_hash = u.password_hash,
    jwt_token = u.jwt_token,
    must_change_password = u.must_change_password
FROM users u
WHERE e.user_id = u.user_id;

-- Create employee records for any orphaned users rows (no linked employee),
-- capturing the old_user_id -> new_employee_id mapping via RETURNING so
-- attendance_entries can be remapped correctly afterwards.
CREATE TEMP TABLE legacy_map AS
WITH inserted AS (
    INSERT INTO employees (emp_code, type, full_name, role_type, email, password_hash, jwt_token, must_change_password, status)
    SELECT 'LEGACY-' || u.user_id, 'Regular', u.full_name, u.role, u.email, u.password_hash, u.jwt_token, u.must_change_password, 'Active'
    FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.user_id)
    RETURNING employee_id, email
)
SELECT i.employee_id, u.user_id AS old_user_id
FROM inserted i JOIN users u ON u.email = i.email;

-- Full old_user_id -> new_employee_id map, covering both already-linked and
-- newly-created-from-legacy employees.
CREATE TEMP TABLE full_map AS
SELECT u.user_id AS old_user_id, e.employee_id AS new_employee_id
FROM users u
JOIN employees e ON e.user_id = u.user_id
UNION ALL
SELECT old_user_id, employee_id FROM legacy_map;

-- Remap "who created this attendance entry" from the old users space to the
-- new employees space. The old FK must be dropped BEFORE writing the new
-- values — otherwise Postgres checks each new value against the *old*
-- target (users.user_id) and rejects it, since the new value is really an
-- employees.employee_id, not a users.user_id.
ALTER TABLE attendance_entries DROP CONSTRAINT IF EXISTS attendance_entries_created_by_user_id_fkey;

UPDATE attendance_entries a
SET created_by_user_id = m.new_employee_id
FROM full_map m
WHERE a.created_by_user_id = m.old_user_id;

-- Now that the values are correct, add the new FK pointing at employees.
ALTER TABLE attendance_entries ADD CONSTRAINT fk_attendance_created_by_employee
    FOREIGN KEY (created_by_user_id) REFERENCES employees(employee_id);

-- Drop the old employees -> users link entirely.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS ux_employees_user_id;
ALTER TABLE employees DROP COLUMN IF EXISTS user_id;

-- Only login-capable accounts need a unique email.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_login_email ON employees (email) WHERE password_hash IS NOT NULL;

-- CASCADE cleans up any remaining old constraint that still points at
-- `users` (e.g. if the fkey name above didn't match exactly) without
-- touching attendance_entries' own data.
DROP TABLE IF EXISTS users CASCADE;

DROP TABLE IF EXISTS legacy_map;
DROP TABLE IF EXISTS full_map;

COMMIT;
