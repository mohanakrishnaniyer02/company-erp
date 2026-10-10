-- ============================================================================
-- Upgrade for an EXISTING database (batch 5): Biometric attendance.
--   * employees.biometric_device_emp_id — the employee's number on the biometric machine
--     (set it on the employee profile; must be unique)
--   * biometric_punches — raw machine captures, used when Biometric:Source is "Local"
-- Safe to run more than once. Keeps all your data. Do NOT run schema.sql for this.
-- ============================================================================
BEGIN;

-- Biometric: each employee's number on the machine, and (for the "Local" source) the raw captures.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS biometric_device_emp_id VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_biometric_device_emp_id
    ON employees (biometric_device_emp_id) WHERE biometric_device_emp_id IS NOT NULL;

-- Same shape as the machine's own Attendance_MachineData table. The app reads this table when
-- Biometric:Source is "Local" (the default); with "SqlServer" it reads the machine's table instead.
CREATE TABLE IF NOT EXISTS biometric_punches (
    punch_id        SERIAL PRIMARY KEY,
    device_oid      INT,                                   -- which machine
    device_emp_id   VARCHAR(30) NOT NULL,                  -- employee number on the machine
    attendance_date DATE NOT NULL,
    captured_at     TIMESTAMP(3) NOT NULL,                 -- date and time captured, to the millisecond
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    rec_status      CHAR(1) NOT NULL DEFAULT 'A'           -- A = active
);
CREATE INDEX IF NOT EXISTS idx_biometric_punches_lookup ON biometric_punches (device_emp_id, attendance_date);

COMMIT;
