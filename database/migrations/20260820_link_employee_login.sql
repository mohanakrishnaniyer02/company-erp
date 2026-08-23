-- Link employees to real login accounts (users table), so that setting an
-- employee's Role to HR/Admin/SuperAdmin can be tied to an actual, working
-- login — instead of RoleType being a disconnected label with no password.
-- Safe to run once against an existing database.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ux_employees_user_id'
    ) THEN
        ALTER TABLE employees ADD CONSTRAINT ux_employees_user_id UNIQUE (user_id);
    END IF;
END $$;
