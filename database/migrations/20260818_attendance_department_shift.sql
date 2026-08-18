-- Existing database upgrade from the previous Git version.
-- Run this once against the existing PostgreSQL database before starting the updated API.

ALTER TABLE departments ADD COLUMN IF NOT EXISTS ot_allowed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS min_ot_minutes INT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS max_ot_minutes INT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS required_work_minutes INT NOT NULL DEFAULT 480;

ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS shift_code VARCHAR(30);
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS shift_start_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS shift_end_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS lunch_start_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS lunch_end_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS grace_in_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS grace_out_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS late_after_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS early_out_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS minimum_work_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS half_day_minutes INT NOT NULL DEFAULT 240;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS full_day_minutes INT NOT NULL DEFAULT 480;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS ot_allowed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS ot_start_after_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

UPDATE shift_templates
SET shift_code = COALESCE(NULLIF(shift_code,''), 'SHIFT-' || shift_id),
    shift_start_time = COALESCE(shift_start_time, start_time),
    shift_end_time = COALESCE(shift_end_time, end_time),
    lunch_start_time = COALESCE(lunch_start_time, lunch_start),
    lunch_end_time = COALESCE(lunch_end_time, lunch_end),
    is_night_shift = COALESCE(is_night_shift, is_next_day);

ALTER TABLE shift_templates ALTER COLUMN shift_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_shift_templates_shift_code ON shift_templates(shift_code);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_id INT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_type VARCHAR(20) NOT NULL DEFAULT 'User';

UPDATE employees e
SET shift_id = a.shift_id
FROM (
    SELECT DISTINCT ON (employee_id) employee_id, shift_id
    FROM employee_shift_assignment
    ORDER BY employee_id, effective_from DESC
) a
WHERE e.employee_id = a.employee_id AND e.shift_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_shift'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT fk_employees_shift
            FOREIGN KEY (shift_id) REFERENCES shift_templates(shift_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance_statuses (
    attendance_status_id SERIAL PRIMARY KEY,
    status VARCHAR(30) NOT NULL UNIQUE,
    attendance_units NUMERIC(5,2) NOT NULL DEFAULT 0,
    meaning VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO attendance_statuses(status,attendance_units,meaning)
SELECT x.status,x.units,x.meaning
FROM (VALUES
 ('PRESENT',1.00,'Full day'),('ABSENT',0.00,'No payable day'),
 ('HALF_DAY',0.50,'Half day'),('WEEKLY_OFF',0.00,'Weekly off'),
 ('HOLIDAY',0.00,'Holiday'),('PAID_LEAVE',1.00,'Paid leave'),
 ('UNPAID_LEAVE',0.00,'Unpaid leave'),('ON_DUTY',1.00,'Full-day official duty')
) x(status,units,meaning)
WHERE NOT EXISTS (SELECT 1 FROM attendance_statuses s WHERE s.status=x.status);

CREATE TABLE IF NOT EXISTS ot_rounding_rules (
    ot_rounding_rule_id SERIAL PRIMARY KEY,
    from_minutes INT NOT NULL CHECK (from_minutes >= 0),
    to_minutes INT NOT NULL CHECK (to_minutes >= from_minutes),
    rounded_minutes INT NOT NULL CHECK (rounded_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO ot_rounding_rules(from_minutes,to_minutes,rounded_minutes)
SELECT x.f,x.t,x.r
FROM (VALUES (0,29,0),(30,59,30),(60,89,60),(90,119,90),(120,149,120),
             (150,179,150),(180,209,180),(210,239,210)) x(f,t,r)
WHERE NOT EXISTS (SELECT 1 FROM ot_rounding_rules);

CREATE TABLE IF NOT EXISTS attendance_entries (
    attendance_id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(employee_id),
    attendance_date DATE NOT NULL,
    shift_id INT NOT NULL REFERENCES shift_templates(shift_id),
    attendance_status_id INT NOT NULL REFERENCES attendance_statuses(attendance_status_id),
    entry_type VARCHAR(20) NOT NULL DEFAULT 'User' CHECK (entry_type IN ('User','Biometric')),
    in1 TIME, out1 TIME, in2 TIME, out2 TIME, in3 TIME, out3 TIME, in4 TIME, out4 TIME, in5 TIME, out5 TIME,
    actual_work_minutes INT NOT NULL DEFAULT 0,
    required_work_minutes INT NOT NULL DEFAULT 0,
    calculated_ot_minutes INT NOT NULL DEFAULT 0,
    rounded_ot_minutes INT NOT NULL DEFAULT 0,
    approved_ot_minutes INT NOT NULL DEFAULT 0,
    reason TEXT,
    created_by_user_id INT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(employee_id,attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_entries(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_entries(employee_id,attendance_date);

-- Optional cleanup after verification:
-- ALTER TABLE shift_templates DROP COLUMN start_time, end_time, is_next_day,
--   break1_start, break1_end, break2_start, break2_end, lunch_start, lunch_end;
