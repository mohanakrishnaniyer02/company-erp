-- ============================================================================
-- Upgrade for an EXISTING database (batch 3): Approvals.
--   * approval_requests — pending/decided requests to add or deactivate an employee
--   * attendance_entries gets OT-approval columns:
--       ot_status, counted_work_minutes, ot_decided_by_employee_id, ot_decided_at
--
-- Existing attendance is brought across as already decided, so nothing suddenly
-- shows up as pending:
--   approved OT > 0                       -> APPROVED (amount unchanged)
--   OT calculated but approved as 0       -> REJECTED
--   no OT                                 -> NONE
-- counted_work_minutes is filled in for every existing row.
--
-- Safe to run more than once (the one-time conversion only happens the first
-- time). Keeps all your data. Do NOT run schema.sql for this — that wipes the
-- database.
-- ============================================================================
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attendance_entries' AND column_name = 'ot_status') THEN

        ALTER TABLE attendance_entries
            ADD COLUMN ot_status VARCHAR(10) NOT NULL DEFAULT 'NONE'
                CHECK (ot_status IN ('NONE','PENDING','APPROVED','REJECTED')),
            ADD COLUMN counted_work_minutes INT NOT NULL DEFAULT 0,
            ADD COLUMN ot_decided_by_employee_id INT REFERENCES employees(employee_id) ON DELETE SET NULL,
            ADD COLUMN ot_decided_at TIMESTAMP;

        UPDATE attendance_entries SET
            ot_status = CASE WHEN approved_ot_minutes > 0 THEN 'APPROVED'
                             WHEN rounded_ot_minutes  > 0 THEN 'REJECTED'
                             ELSE 'NONE' END,
            counted_work_minutes = LEAST(actual_work_minutes, required_work_minutes)
                                   + CASE WHEN approved_ot_minutes > 0 THEN approved_ot_minutes ELSE 0 END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_ot_status ON attendance_entries (ot_status) WHERE ot_status = 'PENDING';

CREATE TABLE IF NOT EXISTS approval_requests (
    approval_request_id       SERIAL PRIMARY KEY,
    request_type              VARCHAR(20) NOT NULL CHECK (request_type IN ('EMPLOYEE_ADD','EMPLOYEE_DELETE')),
    status                    VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    target_employee_id        INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    summary_code              VARCHAR(30),
    summary_name              VARCHAR(150) NOT NULL,
    payload                   TEXT NOT NULL DEFAULT '{}',
    requested_by_employee_id  INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    requested_at              TIMESTAMP NOT NULL DEFAULT now(),
    decided_by_employee_id    INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    decided_at                TIMESTAMP,
    decision_note             TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status, request_type);

COMMIT;
