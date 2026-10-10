-- ============================================================================
-- Upgrade for an EXISTING database (batch 4): Attendance rules.
--   * attendance_entries gets late_in_minutes / early_out_minutes
--   * attendance_rule_sets / _tiers   — the configurable ladders (Admin/SuperAdmin page)
--   * attendance_rule_applications / _charges — what was applied to which entry
--   * one example ladder ("Standard late-in policy", all departments) if you have none yet
--
-- Existing attendance entries keep 0 late/early minutes (they were not measured when
-- entered). Open and re-save an entry to have it measured.
-- Safe to run more than once. Keeps all your data. Do NOT run schema.sql for this.
-- ============================================================================
BEGIN;

ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS late_in_minutes   INT NOT NULL DEFAULT 0;
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS early_out_minutes INT NOT NULL DEFAULT 0;

-- Attendance rules: a "ladder" of consequences for coming in late / leaving early.
-- One rule set per Department (org_department_id NULL = "All Departments", the fallback)
-- per check (LATE_IN or EARLY_OUT). Nothing is deducted unless HR ticks "Apply attendance
-- rules" on an attendance entry.
CREATE TABLE IF NOT EXISTS attendance_rule_sets (
    rule_set_id        SERIAL PRIMARY KEY,
    name               VARCHAR(120) NOT NULL,
    org_department_id  INT REFERENCES org_departments(org_department_id) ON DELETE CASCADE,  -- NULL = all departments
    watch              VARCHAR(12) NOT NULL CHECK (watch IN ('LATE_IN','EARLY_OUT')),
    reset_period       VARCHAR(6)  NOT NULL DEFAULT 'MONTH' CHECK (reset_period IN ('MONTH','YEAR')),
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP NOT NULL DEFAULT now()
);
-- Only one ACTIVE ladder per Department per check (NULL department counts as its own group).
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_rule_sets_active
    ON attendance_rule_sets (COALESCE(org_department_id, 0), watch) WHERE is_active;

CREATE TABLE IF NOT EXISTS attendance_rule_tiers (
    tier_id          SERIAL PRIMARY KEY,
    rule_set_id      INT NOT NULL REFERENCES attendance_rule_sets(rule_set_id) ON DELETE CASCADE,
    min_minutes      INT NOT NULL CHECK (min_minutes >= 1),      -- the variance this step starts at
    occurrence_no    INT NOT NULL CHECK (occurrence_no >= 1),    -- 1st, 2nd, 3rd... time in the period; the last one repeats
    action           VARCHAR(12) NOT NULL CHECK (action IN ('PERMISSION','CASUAL','SICK','LOP','WARNING')),
    amount           NUMERIC(8,2) NOT NULL DEFAULT 0,            -- minutes for PERMISSION, days for the rest
    on_low_balance   VARCHAR(30) NOT NULL DEFAULT 'WARN'
                     CHECK (on_low_balance IN ('USE_AVAILABLE','FALLBACK','USE_AVAILABLE_THEN_FALLBACK','WARN')),
    fallback_action  VARCHAR(12) CHECK (fallback_action IN ('CASUAL','SICK','LOP')),
    fallback_amount  NUMERIC(8,2) NOT NULL DEFAULT 0
    -- duplicate (occurrence, threshold) steps are rejected by the API, not here, so a ladder can be replaced in one save
);

-- That a rule set was applied to one attendance entry, and what it cost.
CREATE TABLE IF NOT EXISTS attendance_rule_applications (
    application_id         SERIAL PRIMARY KEY,
    attendance_id          INT NOT NULL REFERENCES attendance_entries(attendance_id) ON DELETE CASCADE,
    employee_id            INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    attendance_date        DATE NOT NULL,
    rule_set_id            INT REFERENCES attendance_rule_sets(rule_set_id) ON DELETE SET NULL,
    rule_set_name          VARCHAR(120) NOT NULL,                -- kept even if the rule set is later edited or deleted
    tier_id                INT REFERENCES attendance_rule_tiers(tier_id) ON DELETE SET NULL,
    watch                  VARCHAR(12) NOT NULL CHECK (watch IN ('LATE_IN','EARLY_OUT')),
    variance_minutes       INT NOT NULL,
    occurrence_no          INT NOT NULL,
    applied_by_employee_id INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    applied_at             TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rule_apps_emp_watch_date ON attendance_rule_applications (employee_id, watch, attendance_date);
CREATE INDEX IF NOT EXISTS idx_rule_apps_attendance ON attendance_rule_applications (attendance_id);

CREATE TABLE IF NOT EXISTS attendance_rule_charges (
    charge_id       SERIAL PRIMARY KEY,
    application_id  INT NOT NULL REFERENCES attendance_rule_applications(application_id) ON DELETE CASCADE,
    action          VARCHAR(12) NOT NULL CHECK (action IN ('PERMISSION','CASUAL','SICK','LOP','WARNING')),
    amount          NUMERIC(8,2) NOT NULL DEFAULT 0,
    leave_entry_id  INT REFERENCES leave_entries(leave_entry_id) ON DELETE SET NULL,   -- the deduction recorded on the leave balance
    note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_rule_charges_application ON attendance_rule_charges (application_id);

-- Example ladder for "All Departments" (edit or delete it on the Attendance Rules page):
-- 30+ minutes late -> 1st & 2nd time 60 min Permission, 3rd time 1 Casual day, 4th time onwards 1 day Loss of Pay.
INSERT INTO attendance_rule_sets (name, org_department_id, watch, reset_period, is_active)
SELECT 'Standard late-in policy', NULL, 'LATE_IN', 'MONTH', TRUE
WHERE NOT EXISTS (SELECT 1 FROM attendance_rule_sets);

INSERT INTO attendance_rule_tiers (rule_set_id, min_minutes, occurrence_no, action, amount, on_low_balance, fallback_action, fallback_amount)
SELECT s.rule_set_id, v.min_minutes, v.occ, v.action, v.amount, v.low, v.fb, v.fb_amount
FROM attendance_rule_sets s
JOIN (VALUES
    (30, 1, 'PERMISSION', 60, 'USE_AVAILABLE_THEN_FALLBACK', 'CASUAL', 0.5),
    (30, 2, 'PERMISSION', 60, 'USE_AVAILABLE_THEN_FALLBACK', 'CASUAL', 0.5),
    (30, 3, 'CASUAL',      1, 'FALLBACK',                    'LOP',    1),
    (30, 4, 'LOP',         1, 'WARN',                        NULL,     0)
) AS v(min_minutes, occ, action, amount, low, fb, fb_amount) ON TRUE
WHERE s.name = 'Standard late-in policy' AND s.org_department_id IS NULL AND s.watch = 'LATE_IN'
  AND NOT EXISTS (SELECT 1 FROM attendance_rule_tiers);

COMMIT;
