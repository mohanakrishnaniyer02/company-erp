-- ============================================================================
-- Upgrade for an EXISTING database (batch 2): the Leave screen.
--   * leave_types   — the policy (Sick 6 days/year, Casual 1 day/month in half-day
--                     steps, Permission 120 minutes/month)
--   * leave_entries — leave taken / manual adjustments
-- Balances are calculated from the policy, so nobody has to "grant" anything.
--
-- Safe to run more than once. Keeps all your data. Do NOT run schema.sql for
-- this — that wipes the database.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS leave_types (
    leave_type_id   SERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(60) NOT NULL,
    unit            VARCHAR(10) NOT NULL CHECK (unit IN ('DAYS','MINUTES')),
    period          VARCHAR(10) NOT NULL CHECK (period IN ('YEAR','MONTH')),
    allowance       NUMERIC(8,2) NOT NULL CHECK (allowance >= 0),
    step            NUMERIC(8,2) NOT NULL CHECK (step > 0)
);

INSERT INTO leave_types (code, name, unit, period, allowance, step) VALUES
 ('SICK',       'Sick Leave',   'DAYS',    'YEAR',   6,   1),
 ('CASUAL',     'Casual Leave', 'DAYS',    'MONTH',  1,   0.5),
 ('PERMISSION', 'Permission',   'MINUTES', 'MONTH',  120, 1)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_entries (
    leave_entry_id          SERIAL PRIMARY KEY,
    employee_id             INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    leave_type_id           INT NOT NULL REFERENCES leave_types(leave_type_id),
    kind                    VARCHAR(10) NOT NULL CHECK (kind IN ('TAKEN','ADJUST')),
    leave_date              DATE NOT NULL,
    amount                  NUMERIC(8,2) NOT NULL,
    reason                  TEXT,
    created_by_employee_id  INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    CHECK ((kind = 'TAKEN' AND amount > 0) OR (kind = 'ADJUST' AND amount <> 0 AND reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_leave_entries_emp_type_date ON leave_entries (employee_id, leave_type_id, leave_date);

COMMIT;
