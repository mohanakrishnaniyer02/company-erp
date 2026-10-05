-- ============================================================================
-- Upgrade for an EXISTING database (batch 1):
--   * new "Department" list (org_departments) + employees.org_department_id
--     (the existing departments become "Payroll Departments" — same table)
--   * Shift Mapping (shift_mappings)
--   * shift_templates: drops late_after_minutes, early_out_minutes, ot_allowed
--     (OT eligibility now comes only from the Payroll Department's policy)
--
-- Safe to run more than once. Keeps all your data. Do NOT run schema.sql
-- for this — that wipes the database. A brand-new database needs only
-- schema.sql, never this file.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS org_departments (
    org_department_id   SERIAL PRIMARY KEY,
    department_name     VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO org_departments (department_name) VALUES
 ('Technology'), ('Product & Design'), ('Finance & Accounts'), ('People & Culture'), ('Quality & Operations')
ON CONFLICT (department_name) DO NOTHING;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_department_id INT REFERENCES org_departments(org_department_id);

CREATE TABLE IF NOT EXISTS shift_mappings (
    shift_mapping_id  SERIAL PRIMARY KEY,
    employee_id       INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    shift_id          INT NOT NULL REFERENCES shift_templates(shift_id),
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_shift_mappings_employee_dates ON shift_mappings (employee_id, start_date, end_date);

ALTER TABLE shift_templates DROP COLUMN IF EXISTS late_after_minutes;
ALTER TABLE shift_templates DROP COLUMN IF EXISTS early_out_minutes;
ALTER TABLE shift_templates DROP COLUMN IF EXISTS ot_allowed;

COMMIT;
