-- ============================================================
-- Company HR / ERP — PostgreSQL schema
-- ============================================================

DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS biometric_punches CASCADE;
DROP TABLE IF EXISTS attendance_rule_charges CASCADE;
DROP TABLE IF EXISTS attendance_rule_applications CASCADE;
DROP TABLE IF EXISTS attendance_rule_tiers CASCADE;
DROP TABLE IF EXISTS attendance_rule_sets CASCADE;
DROP TABLE IF EXISTS leave_entries CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
DROP TABLE IF EXISTS shift_mappings CASCADE;
DROP TABLE IF EXISTS attendance_punches CASCADE;
DROP TABLE IF EXISTS attendance_entries CASCADE;
DROP TABLE IF EXISTS ot_rounding_rules CASCADE;
DROP TABLE IF EXISTS attendance_statuses CASCADE;
DROP TABLE IF EXISTS employee_shift_assignment CASCADE;
DROP TABLE IF EXISTS shift_templates CASCADE;
DROP TABLE IF EXISTS employee_education CASCADE;
DROP TABLE IF EXISTS employee_address CASCADE;
DROP TABLE IF EXISTS employee_proof CASCADE;
DROP TABLE IF EXISTS employee_bank_details CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS org_departments CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- No separate users table. Every person is one row in employees — login
-- credentials (password_hash, jwt_token, must_change_password) live directly
-- on the employee record and are simply NULL for plain "User"-role employees
-- who never get application access.

CREATE TABLE companies (
    company_id        SERIAL PRIMARY KEY,
    company_name      VARCHAR(150) NOT NULL,
    is_sub_company    BOOLEAN NOT NULL DEFAULT FALSE,
    parent_company_id INT REFERENCES companies(company_id)
);

CREATE TABLE locations (
    location_id   SERIAL PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE departments (
    department_id       SERIAL PRIMARY KEY,
    department_name     VARCHAR(100) NOT NULL UNIQUE,
    ot_allowed          BOOLEAN NOT NULL DEFAULT FALSE,
    min_ot_minutes      INT,
    max_ot_minutes      INT,
    required_work_minutes INT NOT NULL DEFAULT 480 CHECK (required_work_minutes > 0),
    CHECK (NOT ot_allowed OR (min_ot_minutes IS NOT NULL AND max_ot_minutes IS NOT NULL AND min_ot_minutes <= max_ot_minutes))
);

-- Organisational departments (name only). Not to be confused with `departments`
-- above, which are the *payroll* departments carrying OT policy / required hours.
CREATE TABLE org_departments (
    org_department_id   SERIAL PRIMARY KEY,
    department_name     VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE shift_templates (
    shift_id                SERIAL PRIMARY KEY,
    shift_code              VARCHAR(30) NOT NULL UNIQUE,
    shift_name              VARCHAR(100) NOT NULL,
    shift_start_time        TIME NOT NULL,
    shift_end_time          TIME NOT NULL,
    lunch_start_time        TIME,
    lunch_end_time          TIME,
    grace_in_minutes        INT NOT NULL DEFAULT 0,
    grace_out_minutes       INT NOT NULL DEFAULT 0,
    minimum_work_minutes    INT NOT NULL DEFAULT 0,
    half_day_minutes        INT NOT NULL DEFAULT 240,
    full_day_minutes        INT NOT NULL DEFAULT 480,
    ot_start_after_minutes  INT NOT NULL DEFAULT 0,
    is_night_shift          BOOLEAN NOT NULL DEFAULT FALSE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'Active'
                            CHECK (status IN ('Active','Inactive'))
);

CREATE TABLE employees (
    employee_id       SERIAL PRIMARY KEY,
    emp_code          VARCHAR(30) NOT NULL UNIQUE,
    type              VARCHAR(20) NOT NULL DEFAULT 'Regular'
                      CHECK (type IN ('Regular','Contract')),
    full_name         VARCHAR(150) NOT NULL,
    designation       VARCHAR(150),
    department_id     INT REFERENCES departments(department_id),   -- payroll department
    org_department_id INT REFERENCES org_departments(org_department_id),
    company_id        INT REFERENCES companies(company_id),
    manager_id        INT REFERENCES employees(employee_id),
    shift_id          INT REFERENCES shift_templates(shift_id),
    role_type         VARCHAR(20) NOT NULL DEFAULT 'User'
                      CHECK (role_type IN ('User','HR','Admin','SuperAdmin')),
    password_hash     VARCHAR(255),
    jwt_token         TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    date_of_joining   DATE,
    date_of_birth     DATE,
    date_of_leaving   DATE,
    leaving_comments  TEXT,
    location_id       INT REFERENCES locations(location_id),
    email             VARCHAR(150),
    phone_number      VARCHAR(20),
    photo_url         TEXT,
    marital_status    VARCHAR(20) CHECK (marital_status IN ('Single','Married')),
    status            VARCHAR(20) NOT NULL DEFAULT 'Active'
                      CHECK (status IN ('Active','Inactive')),
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_name ON employees (full_name);
CREATE INDEX idx_employees_dept ON employees (department_id);
-- Only login-capable accounts need a unique email; plain employees without
-- application access aren't constrained by this.
CREATE UNIQUE INDEX ux_employees_login_email ON employees (email) WHERE password_hash IS NOT NULL;

CREATE TABLE employee_bank_details (
    bank_detail_id  SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    bank_name       VARCHAR(150),
    account_number  VARCHAR(40),
    ifsc_code       VARCHAR(20),
    branch_name     VARCHAR(150),
    esi_number      VARCHAR(30),
    pan_number      VARCHAR(20),
    UNIQUE(employee_id)
);

CREATE TABLE employee_proof (
    proof_id        SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    proof_type      VARCHAR(50) NOT NULL,
    proof_number    VARCHAR(50) NOT NULL,
    attachment_url  TEXT
);

CREATE TABLE employee_address (
    address_id               SERIAL PRIMARY KEY,
    employee_id              INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    address_type             VARCHAR(20) NOT NULL CHECK (address_type IN ('Current','Permanent')),
    address_line1            VARCHAR(200),
    address_line2            VARCHAR(200),
    address_line3            VARCHAR(200),
    emergency_person         VARCHAR(150),
    emergency_contact_number VARCHAR(20),
    UNIQUE(employee_id, address_type)
);

CREATE TABLE employee_education (
    education_id      SERIAL PRIMARY KEY,
    employee_id       INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    institution_name  VARCHAR(200),
    degree            VARCHAR(150),
    completion_date   DATE
);

CREATE TABLE employee_shift_assignment (
    assignment_id   SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    shift_id        INT NOT NULL REFERENCES shift_templates(shift_id),
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(employee_id, effective_from)
);

-- Date-ranged shift overrides: an employee works `shift_id` from start_date to
-- end_date inclusive; outside any mapping their own employees.shift_id applies.
-- (Overlap per employee is rejected by the API.)
CREATE TABLE shift_mappings (
    shift_mapping_id  SERIAL PRIMARY KEY,
    employee_id       INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    shift_id          INT NOT NULL REFERENCES shift_templates(shift_id),
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);
CREATE INDEX idx_shift_mappings_employee_dates ON shift_mappings (employee_id, start_date, end_date);

-- Leave policy. Balances are NOT stored: entitlement comes from this table
-- (per employee, per period; unused leave lapses, nothing carries forward) and
-- leave_entries below records only what was taken or manually adjusted.
CREATE TABLE leave_types (
    leave_type_id   SERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(60) NOT NULL,
    unit            VARCHAR(10) NOT NULL CHECK (unit IN ('DAYS','MINUTES')),
    period          VARCHAR(10) NOT NULL CHECK (period IN ('YEAR','MONTH')),   -- YEAR = calendar year Jan-Dec
    allowance       NUMERIC(8,2) NOT NULL CHECK (allowance >= 0),               -- per period, in `unit`
    step            NUMERIC(8,2) NOT NULL CHECK (step > 0)                      -- smallest recordable amount
);

CREATE TABLE leave_entries (
    leave_entry_id          SERIAL PRIMARY KEY,
    employee_id             INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    leave_type_id           INT NOT NULL REFERENCES leave_types(leave_type_id),
    kind                    VARCHAR(10) NOT NULL CHECK (kind IN ('TAKEN','ADJUST')),
    leave_date              DATE NOT NULL,          -- decides which year/month period it counts against
    amount                  NUMERIC(8,2) NOT NULL,  -- TAKEN: positive, deducts. ADJUST: signed, +adds / -deducts
    reason                  TEXT,
    created_by_employee_id  INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    CHECK ((kind = 'TAKEN' AND amount > 0) OR (kind = 'ADJUST' AND amount <> 0 AND reason IS NOT NULL))
);
CREATE INDEX idx_leave_entries_emp_type_date ON leave_entries (employee_id, leave_type_id, leave_date);

-- Requests to add or deactivate an employee. Nothing touches `employees` until an
-- Admin/SuperAdmin approves. For EMPLOYEE_ADD the full details sit in `payload`
-- (JSON text; the login password is stored only as a hash, never in plain text).
CREATE TABLE approval_requests (
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
CREATE INDEX idx_approval_requests_status ON approval_requests (status, request_type);

CREATE TABLE attendance_statuses (
    attendance_status_id SERIAL PRIMARY KEY,
    status               VARCHAR(30) NOT NULL UNIQUE,
    attendance_units     NUMERIC(5,2) NOT NULL DEFAULT 0,
    meaning              VARCHAR(150) NOT NULL,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ot_rounding_rules (
    ot_rounding_rule_id SERIAL PRIMARY KEY,
    from_minutes        INT NOT NULL CHECK (from_minutes >= 0),
    to_minutes          INT NOT NULL CHECK (to_minutes >= from_minutes),
    rounded_minutes     INT NOT NULL CHECK (rounded_minutes >= 0),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE attendance_entries (
    attendance_id         SERIAL PRIMARY KEY,
    employee_id           INT NOT NULL REFERENCES employees(employee_id),
    attendance_date       DATE NOT NULL,
    shift_id              INT NOT NULL REFERENCES shift_templates(shift_id),
    attendance_status_id  INT NOT NULL REFERENCES attendance_statuses(attendance_status_id),
    entry_type             VARCHAR(20) NOT NULL DEFAULT 'User'
                           CHECK (entry_type IN ('User','Biometric')),
    actual_work_minutes   INT NOT NULL DEFAULT 0,
    required_work_minutes INT NOT NULL DEFAULT 0,
    calculated_ot_minutes INT NOT NULL DEFAULT 0,
    rounded_ot_minutes    INT NOT NULL DEFAULT 0,
    approved_ot_minutes   INT NOT NULL DEFAULT 0,     -- only non-zero once the OT is APPROVED
    reason                TEXT,                       -- the OT approver's note
    comments              TEXT,
    late_in_minutes       INT NOT NULL DEFAULT 0,     -- minutes past shift start once Grace In is exceeded
    early_out_minutes     INT NOT NULL DEFAULT 0,     -- minutes before shift end once Grace Out is exceeded
    -- OT approval: any OT > 0 is PENDING until an Admin/SuperAdmin approves (possibly
    -- editing the minutes) or rejects it. Pending/rejected OT counts for nothing.
    ot_status             VARCHAR(10) NOT NULL DEFAULT 'NONE'
                          CHECK (ot_status IN ('NONE','PENDING','APPROVED','REJECTED')),
    counted_work_minutes  INT NOT NULL DEFAULT 0,     -- min(actual, required) + approved OT: what counts toward pay
    ot_decided_by_employee_id INT REFERENCES employees(employee_id) ON DELETE SET NULL,
    ot_decided_at         TIMESTAMP,
    created_by_user_id    INT REFERENCES employees(employee_id),
    created_at            TIMESTAMP NOT NULL DEFAULT now(),
    updated_at            TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(employee_id, attendance_date)
);
CREATE INDEX idx_attendance_date ON attendance_entries(attendance_date);
CREATE INDEX idx_attendance_ot_status ON attendance_entries(ot_status) WHERE ot_status = 'PENDING';
CREATE INDEX idx_attendance_employee ON attendance_entries(employee_id, attendance_date);

-- One row per In/Out pair for a day, instead of a fixed in1..out5 column set —
-- an employee can have as many punch pairs as they actually made that day.
CREATE TABLE attendance_punches (
    punch_id       SERIAL PRIMARY KEY,
    attendance_id  INT NOT NULL REFERENCES attendance_entries(attendance_id) ON DELETE CASCADE,
    sequence_no    INT NOT NULL,
    punch_in       TIME,
    punch_out      TIME,
    UNIQUE(attendance_id, sequence_no)
);
CREATE INDEX idx_attendance_punches_attendance ON attendance_punches(attendance_id);

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

-- One working bootstrap SuperAdmin account, seeded directly as an employee —
-- no public signup exists anymore. Log in with this and use the Employee
-- form to add real Admin/HR people for the organization. This password
-- stays in effect permanently — there's no forced change on first login;
-- use the Employee form's password-reset field (or the voluntary Change
-- Password option once logged in) if you want to set a different one.
--   Email:    superadmin@company.com
--   Password: ChangeMe123!
INSERT INTO employees (emp_code, type, full_name, role_type, email, password_hash, must_change_password, status) VALUES
 ('SUPERADMIN-001', 'Regular', 'System Administrator', 'SuperAdmin', 'superadmin@company.com', '$2b$11$Z9xV0Rh/BjRctSqbT2oEFO1XkR7UbH.2zpk8/TGmom6F/VujYNTX6', FALSE, 'Active');

INSERT INTO companies (company_name, is_sub_company, parent_company_id) VALUES
 ('Company Tech Pvt Ltd', FALSE, NULL),
 ('Company Logistics', TRUE, 1),
 ('Company Retail', TRUE, 1);

INSERT INTO locations (location_name) VALUES ('Chennai'),('Bengaluru'),('Pune'),('Remote');

INSERT INTO departments (department_name, ot_allowed, min_ot_minutes, max_ot_minutes, required_work_minutes) VALUES
 ('Product', TRUE, 30, 240, 480),
 ('Engineering', TRUE, 30, 240, 480),
 ('Finance', FALSE, NULL, NULL, 480),
 ('HR', FALSE, NULL, NULL, 480);

INSERT INTO shift_templates
(shift_code, shift_name, shift_start_time, shift_end_time, lunch_start_time, lunch_end_time,
 grace_in_minutes, grace_out_minutes,
 minimum_work_minutes, half_day_minutes, full_day_minutes,
 ot_start_after_minutes, is_night_shift, status)
VALUES
('DAY', 'Day Shift', '09:30','18:30','13:00','13:30',10,10,240,240,480,0,FALSE,'Active'),
('NIGHT', 'Night Shift', '21:30','06:30','01:30','02:00',10,10,240,240,480,0,TRUE,'Active');

INSERT INTO leave_types (code, name, unit, period, allowance, step) VALUES
 ('SICK',       'Sick Leave',   'DAYS',    'YEAR',   6,   1),
 ('CASUAL',     'Casual Leave', 'DAYS',    'MONTH',  1,   0.5),
 ('PERMISSION', 'Permission',   'MINUTES', 'MONTH',  120, 1);

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

INSERT INTO org_departments (department_name) VALUES
 ('Technology'), ('Product & Design'), ('Finance & Accounts'), ('People & Culture'), ('Quality & Operations');

INSERT INTO attendance_statuses (status, attendance_units, meaning) VALUES
('PRESENT', 1.00, 'Full day'),
('ABSENT', 0.00, 'No payable day'),
('HALF_DAY', 0.50, 'Half day'),
('WEEKLY_OFF', 0.00, 'Weekly off'),
('HOLIDAY', 0.00, 'Holiday'),
('PAID_LEAVE', 1.00, 'Paid leave'),
('UNPAID_LEAVE', 0.00, 'Unpaid leave'),
('ON_DUTY', 1.00, 'Full-day official duty');

-- Configurable rule equivalent to the supplied rounding table:
-- 0-29 => 0, 30-59 => 30, 60-89 => 60, etc.
INSERT INTO ot_rounding_rules (from_minutes, to_minutes, rounded_minutes) VALUES
(0,29,0),(30,59,30),(60,89,60),(90,119,90),(120,149,120),
(150,179,150),(180,209,180),(210,239,210);

-- A few starting people so a fresh install isn't just one lonely SuperAdmin —
-- two more login-capable accounts (HR and Admin) so you can test the role
-- hierarchy immediately, plus a couple of plain "User" employees (no login)
-- to show what a normal employee record looks like. Same temporary password
-- pattern as the bootstrap account — forced to change it on first login.
--   HR:    priya.menon@company.com    / ChangeMe123!
--   Admin: karthik.rajan@company.com  / ChangeMe123!
INSERT INTO employees
(emp_code, type, full_name, designation, department_id, company_id, shift_id, role_type,
 email, password_hash, must_change_password, phone_number, location_id, status)
VALUES
('EMP-0002','Regular','Priya Menon','HR Executive',4,1,1,'HR',
 'priya.menon@company.com','$2b$11$0Lg8eT2GXWMsGDeNez9GzerQ1gE.b8s/VT9ftncRgyBwAg2IjngSK',FALSE,'+91 9800000031',1,'Active'),
('EMP-0003','Regular','Karthik Rajan','Engineering Manager',2,1,1,'Admin',
 'karthik.rajan@company.com','$2b$11$0Lg8eT2GXWMsGDeNez9GzerQ1gE.b8s/VT9ftncRgyBwAg2IjngSK',FALSE,'+91 9800000032',2,'Active');

-- Plain employees — no login, just HR records (Role Type stays the default 'User').
INSERT INTO employees
(emp_code, type, full_name, designation, department_id, company_id, shift_id, role_type,
 email, phone_number, location_id, status)
VALUES
('EMP-0004','Regular','Ananya Iyer','Senior Product Analyst',1,1,1,'User',
 'ananya.iyer@company.com','+91 9800000033',1,'Active'),
('EMP-0005','Contract','Zoya Khan','Financial Analyst',3,3,1,'User',
 'zoya.khan@company.com','+91 9800000034',3,'Active'),
('EMP-0006','Regular','Arjun Kumar','Product Designer',1,1,1,'User',
 'arjun.kumar@company.com','+91 9800000035',2,'Active'),
('EMP-0007','Regular','Divya Sharma','Finance Executive',3,1,1,'User',
 'divya.sharma@company.com','+91 9800000036',3,'Active'),
('EMP-0008','Contract','Vikram Singh','QA Engineer',2,2,2,'User',
 'vikram.singh@company.com','+91 9800000037',1,'Active');

UPDATE employees SET org_department_id = (SELECT org_department_id FROM org_departments WHERE department_name = 'People & Culture')    WHERE emp_code = 'EMP-0002';
UPDATE employees SET org_department_id = (SELECT org_department_id FROM org_departments WHERE department_name = 'Technology')           WHERE emp_code = 'EMP-0003';
UPDATE employees SET org_department_id = (SELECT org_department_id FROM org_departments WHERE department_name = 'Product & Design')     WHERE emp_code IN ('EMP-0004','EMP-0006');
UPDATE employees SET org_department_id = (SELECT org_department_id FROM org_departments WHERE department_name = 'Finance & Accounts')   WHERE emp_code IN ('EMP-0005','EMP-0007');
UPDATE employees SET org_department_id = (SELECT org_department_id FROM org_departments WHERE department_name = 'Quality & Operations') WHERE emp_code = 'EMP-0008';

-- Demo shift mappings so the Shift Calendar has something to show: two Day-shift
-- employees covering a week of nights each.
INSERT INTO shift_mappings (employee_id, shift_id, start_date, end_date)
SELECT e.employee_id, s.shift_id, DATE '2026-10-05', DATE '2026-10-11'
FROM employees e, shift_templates s WHERE e.emp_code = 'EMP-0004' AND s.shift_code = 'NIGHT';
INSERT INTO shift_mappings (employee_id, shift_id, start_date, end_date)
SELECT e.employee_id, s.shift_id, DATE '2026-10-12', DATE '2026-10-18'
FROM employees e, shift_templates s WHERE e.emp_code = 'EMP-0006' AND s.shift_code = 'NIGHT';

-- A few recorded leaves so the Leave screen has history to show.
INSERT INTO leave_entries (employee_id, leave_type_id, kind, leave_date, amount, reason, created_by_employee_id)
SELECT e.employee_id, t.leave_type_id, 'TAKEN', d.leave_date, d.amount, d.note,
       (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001')
FROM (VALUES
  ('EMP-0004', 'SICK',       DATE '2026-08-27', 1,  'Fever'),
  ('EMP-0002', 'CASUAL',     DATE '2026-10-02', 1,  NULL),
  ('EMP-0006', 'CASUAL',     DATE '2026-10-05', 0.5, 'Half day'),
  ('EMP-0003', 'PERMISSION', DATE '2026-10-01', 45, 'Bank visit'),
  ('EMP-0003', 'PERMISSION', DATE '2026-10-03', 30, NULL)
) AS d(emp_code, leave_code, leave_date, amount, note)
JOIN employees e ON e.emp_code = d.emp_code
JOIN leave_types t ON t.code = d.leave_code;

-- A little more depth on two profiles, so the Bank Details / Proof / Address
-- / Education tabs aren't empty in a demo either.
INSERT INTO employee_bank_details (employee_id, bank_name, account_number, ifsc_code, branch_name, pan_number)
SELECT employee_id, 'HDFC Bank', '50100234567890', 'HDFC0001234', 'Anna Nagar', 'ABCDE1234F'
FROM employees WHERE emp_code = 'EMP-0004';
INSERT INTO employee_bank_details (employee_id, bank_name, account_number, ifsc_code, branch_name, pan_number)
SELECT employee_id, 'ICICI Bank', '00281234567', 'ICIC0000028', 'Indiranagar', 'FGHIJ5678K'
FROM employees WHERE emp_code = 'EMP-0003';

INSERT INTO employee_proof (employee_id, proof_type, proof_number)
SELECT employee_id, 'PAN', 'ABCDE1234F' FROM employees WHERE emp_code = 'EMP-0004';
INSERT INTO employee_proof (employee_id, proof_type, proof_number)
SELECT employee_id, 'Aadhaar', 'XXXX XXXX 4521' FROM employees WHERE emp_code = 'EMP-0004';
INSERT INTO employee_proof (employee_id, proof_type, proof_number)
SELECT employee_id, 'PAN', 'FGHIJ5678K' FROM employees WHERE emp_code = 'EMP-0003';

INSERT INTO employee_address (employee_id, address_type, address_line1, address_line2, address_line3, emergency_person, emergency_contact_number)
SELECT employee_id, 'Current', '14 Lake View Apartments', 'Anna Nagar', 'Chennai, Tamil Nadu 600040', 'Suresh Iyer', '+91 9800000133'
FROM employees WHERE emp_code = 'EMP-0004';
INSERT INTO employee_address (employee_id, address_type, address_line1, address_line2, address_line3, emergency_person, emergency_contact_number)
SELECT employee_id, 'Current', '22 MG Road', 'Indiranagar', 'Bengaluru, Karnataka 560038', 'Lakshmi Rajan', '+91 9800000232'
FROM employees WHERE emp_code = 'EMP-0003';

INSERT INTO employee_education (employee_id, institution_name, degree, completion_date)
SELECT employee_id, 'Anna University', 'B.E. Computer Science', '2016-05-20' FROM employees WHERE emp_code = 'EMP-0004';
INSERT INTO employee_education (employee_id, institution_name, degree, completion_date)
SELECT employee_id, 'IIT Madras', 'M.Tech Software Engineering', '2019-06-15' FROM employees WHERE emp_code = 'EMP-0003';

-- A working week of attendance (Mon 24 Aug – Fri 28 Aug 2026) across five
-- employees, with a mix of full days, partial OT, a half day, and one
-- absence — so the Dashboard KPIs and Attendance Explorer show real,
-- varied numbers on a fresh install instead of empty states.
CREATE TEMP TABLE demo_attendance_map AS
WITH src(emp_code, attendance_date, actual_minutes, status_code, ot_minutes) AS (
    VALUES
    ('EMP-0002','2026-08-24'::date,510,'PRESENT',30), ('EMP-0002','2026-08-25'::date,480,'PRESENT',0),
    ('EMP-0002','2026-08-26'::date,510,'PRESENT',30), ('EMP-0002','2026-08-27'::date,480,'PRESENT',0),
    ('EMP-0002','2026-08-28'::date,240,'HALF_DAY',0),
    ('EMP-0003','2026-08-24'::date,540,'PRESENT',60), ('EMP-0003','2026-08-25'::date,510,'PRESENT',30),
    ('EMP-0003','2026-08-26'::date,510,'PRESENT',30), ('EMP-0003','2026-08-27'::date,480,'PRESENT',0),
    ('EMP-0003','2026-08-28'::date,510,'PRESENT',30),
    ('EMP-0004','2026-08-24'::date,480,'PRESENT',0),   ('EMP-0004','2026-08-25'::date,510,'PRESENT',30),
    ('EMP-0004','2026-08-26'::date,480,'PRESENT',0),   ('EMP-0004','2026-08-27'::date,0,'ABSENT',0),
    ('EMP-0004','2026-08-28'::date,510,'PRESENT',30),
    ('EMP-0005','2026-08-24'::date,510,'PRESENT',30),  ('EMP-0005','2026-08-25'::date,510,'PRESENT',30),
    ('EMP-0005','2026-08-26'::date,480,'PRESENT',0),   ('EMP-0005','2026-08-27'::date,510,'PRESENT',30),
    ('EMP-0005','2026-08-28'::date,480,'PRESENT',0),
    ('EMP-0006','2026-08-24'::date,480,'PRESENT',0),   ('EMP-0006','2026-08-25'::date,240,'HALF_DAY',0),
    ('EMP-0006','2026-08-26'::date,510,'PRESENT',30),  ('EMP-0006','2026-08-27'::date,510,'PRESENT',30),
    ('EMP-0006','2026-08-28'::date,480,'PRESENT',0)
),
inserted AS (
    INSERT INTO attendance_entries
        (employee_id, attendance_date, shift_id, attendance_status_id, entry_type,
         actual_work_minutes, required_work_minutes, calculated_ot_minutes, rounded_ot_minutes, approved_ot_minutes,
         ot_status, counted_work_minutes)
    SELECT e.employee_id, s.attendance_date, 1, st.attendance_status_id, 'Biometric',
           s.actual_minutes, 480, s.ot_minutes, s.ot_minutes,
           CASE WHEN s.attendance_date = DATE '2026-08-28' THEN 0 ELSE s.ot_minutes END,
           CASE WHEN s.ot_minutes = 0 THEN 'NONE' WHEN s.attendance_date = DATE '2026-08-28' THEN 'PENDING' ELSE 'APPROVED' END,
           LEAST(s.actual_minutes, 480) + CASE WHEN s.attendance_date = DATE '2026-08-28' THEN 0 ELSE s.ot_minutes END
    FROM src s
    JOIN employees e ON e.emp_code = s.emp_code
    JOIN attendance_statuses st ON st.status = s.status_code
    RETURNING attendance_id, employee_id, attendance_date
)
SELECT i.attendance_id, e.emp_code, i.attendance_date, i.employee_id
FROM inserted i JOIN employees e ON e.employee_id = i.employee_id;

-- Matching In/Out punches for every entry that isn't an absence. Times are
-- picked so they reproduce the actual_work_minutes above once lunch
-- (13:00–13:30) is excluded: 09:30–18:00 = 480, 09:30–18:30 = 510,
-- 09:30–19:00 = 540, 09:30–14:00 = 240 (half day).
INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
SELECT m.attendance_id, 1,
    '09:30'::time,
    CASE
        WHEN a.actual_work_minutes = 240 THEN '14:00'::time
        WHEN a.actual_work_minutes = 480 THEN '18:00'::time
        WHEN a.actual_work_minutes = 510 THEN '18:30'::time
        WHEN a.actual_work_minutes = 540 THEN '19:00'::time
    END
FROM demo_attendance_map m
JOIN attendance_entries a ON a.attendance_id = m.attendance_id
WHERE a.actual_work_minutes > 0;

DROP TABLE demo_attendance_map;

-- ============================================================================
-- SAMPLE DATA — so every screen has something to look at on first launch.
-- Everything is dated relative to TODAY, so it always looks current.
-- Safe to run more than once and it never overwrites real entries: existing
-- attendance for a date is left alone, and a section is skipped if you already
-- have your own data there. It only FILLS IN blanks:
--   * employees with no Department get one; employees with no Biometric Device ID get one
--   * ~3 weeks of attendance (late arrivals, early outs, breaks, OT pending / approved /
--     rejected, a half day, paid leave) for up to 6 employees on the Day shift
--   * raw biometric captures for the same people (with double scans a few seconds apart),
--     including the 3 most recent working days NOT yet saved as attendance — open
--     Attendance > Add Entry, choose Biometric, pick that employee and date, and watch it fill in
--   * one employee who is late 4 times in a month: the first 3 have the Attendance Rules applied
--     (Permission, Permission, Casual); the 4th is left for you to tick "Apply attendance rules"
--   * example shift mappings and leave history; a pending add-employee and a pending
--     deactivation request on the Approvals screens
-- ============================================================================

-- 1. Department for anyone who has none (matched from the payroll department where possible).
UPDATE employees e SET org_department_id = od.org_department_id
FROM departments d, org_departments od
WHERE e.org_department_id IS NULL AND e.department_id = d.department_id
  AND od.department_name = CASE d.department_name
        WHEN 'Engineering' THEN 'Technology' WHEN 'Product' THEN 'Product & Design'
        WHEN 'Finance' THEN 'Finance & Accounts' WHEN 'HR' THEN 'People & Culture' END;

WITH o AS (
    SELECT org_department_id, row_number() OVER (ORDER BY org_department_id) - 1 AS rn, count(*) OVER () AS cnt
    FROM org_departments)
UPDATE employees e SET org_department_id = o.org_department_id
FROM o WHERE e.org_department_id IS NULL AND o.rn = e.employee_id % o.cnt;

-- 2. A Biometric Device ID (the number on the machine) for everyone who has none: 1000 + their employee id.
UPDATE employees e SET biometric_device_emp_id = (1000 + e.employee_id)::text
WHERE e.biometric_device_emp_id IS NULL AND e.status = 'Active'
  AND NOT EXISTS (SELECT 1 FROM employees x WHERE x.biometric_device_emp_id = (1000 + e.employee_id)::text);

-- 3. Who the attendance examples are for: up to 6 active people on the Day shift, with no shift
--    mapping in the last three weeks.
CREATE TEMP TABLE s_emps AS
SELECT row_number() OVER (ORDER BY e.employee_id)::int AS ord, e.employee_id, e.biometric_device_emp_id AS device_id,
       COALESCE(e.shift_id, ds.shift_id) AS shift_id, d.required_work_minutes AS dept_required,
       COALESCE(d.ot_allowed, TRUE) AS ot_allowed, d.min_ot_minutes, d.max_ot_minutes,
       FALSE AS late_demo
FROM employees e
JOIN (SELECT shift_id FROM shift_templates WHERE shift_code = 'DAY' ORDER BY shift_id LIMIT 1) ds ON TRUE
LEFT JOIN departments d ON d.department_id = e.department_id
WHERE e.status = 'Active' AND e.emp_code <> 'SUPERADMIN-001' AND e.biometric_device_emp_id IS NOT NULL
  AND COALESCE(e.shift_id, ds.shift_id) = ds.shift_id
  AND NOT EXISTS (SELECT 1 FROM shift_mappings m WHERE m.employee_id = e.employee_id
                  AND m.end_date >= CURRENT_DATE - 21 AND m.start_date <= CURRENT_DATE)
ORDER BY e.employee_id
LIMIT 6;

-- The "late a lot" example: the first of them with no Casual/Permission recorded recently
-- (so the deductions below fit inside a normal balance).
UPDATE s_emps SET late_demo = TRUE WHERE ord = COALESCE(
    (SELECT min(s.ord) FROM s_emps s WHERE EXISTS (SELECT 1 FROM attendance_rule_applications x WHERE x.employee_id = s.employee_id)),
    (SELECT min(s.ord) FROM s_emps s WHERE NOT EXISTS (
        SELECT 1 FROM leave_entries l JOIN leave_types t ON t.leave_type_id = l.leave_type_id
        WHERE l.employee_id = s.employee_id AND t.code IN ('CASUAL','PERMISSION') AND l.leave_date >= CURRENT_DATE - 45)));

-- Working days (Mon-Fri) of the last three weeks, newest first. day_idx 1-3 stay unsaved on purpose.
CREATE TEMP TABLE s_days AS
SELECT row_number() OVER (ORDER BY g.d DESC)::int AS day_idx, g.d::date AS att_date
FROM generate_series(CURRENT_DATE - 21, CURRENT_DATE - 1, INTERVAL '1 day') AS g(d)
WHERE EXTRACT(ISODOW FROM g.d) < 6;

-- The kinds of day (times are on the 09:30-18:30 Day shift with lunch 13:00-13:30):
CREATE TEMP TABLE s_kinds (k INT, in1 TIME, out1 TIME, in2 TIME, out2 TIME, note TEXT);
INSERT INTO s_kinds VALUES
 (0, '09:24','13:02','13:36','18:32', NULL),
 (1, '09:29','13:00','13:30','18:30', NULL),
 (2, '09:41','13:05','13:50','18:35', NULL),                       -- 11 min late
 (3, '10:12','13:00','13:45','19:35', 'Bus breakdown'),            -- 42 min late, 38 min OT
 (4, '09:27','13:10','13:55','17:40', 'Left early for an appointment'), -- 50 min early out
 (5, '09:25','13:05','13:40','19:35', 'Month-end closing'),        -- 95 min OT
 (6, '09:30','14:00', NULL,  NULL,   'Half day'),
 (7, NULL,   NULL,   NULL,  NULL,    NULL);                        -- paid leave

CREATE TEMP TABLE s_plan AS
SELECT p.*,
  -- minutes since midnight
  (EXTRACT(HOUR FROM p.in1)*60+EXTRACT(MINUTE FROM p.in1))::int AS i1, (EXTRACT(HOUR FROM p.out1)*60+EXTRACT(MINUTE FROM p.out1))::int AS o1,
  (EXTRACT(HOUR FROM p.in2)*60+EXTRACT(MINUTE FROM p.in2))::int AS i2, (EXTRACT(HOUR FROM p.out2)*60+EXTRACT(MINUTE FROM p.out2))::int AS o2
FROM (
  SELECT s.ord, s.employee_id, s.device_id, s.shift_id, s.late_demo, s.ot_allowed, s.min_ot_minutes, s.max_ot_minutes,
         COALESCE(s.dept_required, st.full_day_minutes) AS required, st.grace_in_minutes, st.grace_out_minutes,
         (EXTRACT(HOUR FROM st.shift_start_time)*60+EXTRACT(MINUTE FROM st.shift_start_time))::int AS shift_start,
         (EXTRACT(HOUR FROM st.shift_end_time)*60+EXTRACT(MINUTE FROM st.shift_end_time))::int AS shift_end,
         (EXTRACT(HOUR FROM st.lunch_start_time)*60+EXTRACT(MINUTE FROM st.lunch_start_time))::int AS lunch_s,
         (EXTRACT(HOUR FROM st.lunch_end_time)*60+EXTRACT(MINUTE FROM st.lunch_end_time))::int AS lunch_e,
         d.day_idx, d.att_date, k.k, k.in1, k.out1, k.in2, k.out2, k.note
  FROM s_emps s
  CROSS JOIN s_days d
  JOIN shift_templates st ON st.shift_id = s.shift_id
  JOIN s_kinds k ON k.k = CASE WHEN s.late_demo AND d.day_idx BETWEEN 4 AND 7 THEN 3
                               ELSE (s.ord * 3 + d.day_idx) % 8 END
) p;

CREATE TEMP TABLE s_calc AS
SELECT p.*,
  GREATEST(0, COALESCE(o1 - i1 - GREATEST(0, LEAST(o1, lunch_e) - GREATEST(i1, lunch_s)), 0))
  + GREATEST(0, COALESCE(o2 - i2 - GREATEST(0, LEAST(o2, lunch_e) - GREATEST(i2, lunch_s)), 0)) AS actual
FROM s_plan p;

CREATE TEMP TABLE s_final AS
SELECT c.*,
  CASE WHEN k = 7 THEN 'PAID_LEAVE' WHEN k = 6 THEN 'HALF_DAY' ELSE 'PRESENT' END AS status_code,
  CASE WHEN k = 7 THEN 0 WHEN (COALESCE(i1,0) - shift_start) > grace_in_minutes THEN i1 - shift_start ELSE 0 END AS late_in,
  CASE WHEN k = 7 THEN 0 WHEN (shift_end - COALESCE(o2, o1)) > grace_out_minutes THEN shift_end - COALESCE(o2, o1) ELSE 0 END AS early_out,
  CASE WHEN NOT ot_allowed OR k = 7 THEN 0
       WHEN GREATEST(0, actual - required) < COALESCE(min_ot_minutes, 0) THEN 0
       ELSE LEAST(GREATEST(0, actual - required), COALESCE(max_ot_minutes, 100000)) END AS ot_calc
FROM s_calc c;

-- 4. Saved attendance entries (everything except the 3 newest working days, which stay for the biometric demo).
CREATE TEMP TABLE s_saved AS
WITH ins AS (
  INSERT INTO attendance_entries
    (employee_id, attendance_date, shift_id, attendance_status_id, entry_type,
     actual_work_minutes, required_work_minutes, calculated_ot_minutes, rounded_ot_minutes, approved_ot_minutes,
     ot_status, counted_work_minutes, late_in_minutes, early_out_minutes, comments, created_by_user_id)
  SELECT f.employee_id, f.att_date, f.shift_id, st.attendance_status_id,
         CASE WHEN (f.ord + f.day_idx) % 2 = 0 THEN 'Biometric' ELSE 'User' END,
         f.actual, f.required, f.ot_calc, (f.ot_calc / 30) * 30,
         CASE WHEN (f.ot_calc / 30) * 30 > 0 AND f.day_idx > 6 AND (f.ord + f.day_idx) % 4 <> 0 THEN (f.ot_calc / 30) * 30 ELSE 0 END,
         CASE WHEN (f.ot_calc / 30) * 30 = 0 THEN 'NONE'
              WHEN f.day_idx <= 6 THEN 'PENDING'
              WHEN (f.ord + f.day_idx) % 4 = 0 THEN 'REJECTED' ELSE 'APPROVED' END,
         LEAST(f.actual, f.required)
           + CASE WHEN (f.ot_calc / 30) * 30 > 0 AND f.day_idx > 6 AND (f.ord + f.day_idx) % 4 <> 0 THEN (f.ot_calc / 30) * 30 ELSE 0 END,
         f.late_in, f.early_out, f.note,
         (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001')
  FROM s_final f
  JOIN attendance_statuses st ON st.status = f.status_code
  WHERE f.day_idx > 3
  ON CONFLICT (employee_id, attendance_date) DO NOTHING
  RETURNING attendance_id, employee_id, attendance_date
)
SELECT * FROM ins;

INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
SELECT sv.attendance_id, 1, f.in1, f.out1 FROM s_saved sv
JOIN s_final f ON f.employee_id = sv.employee_id AND f.att_date = sv.attendance_date WHERE f.in1 IS NOT NULL;
INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
SELECT sv.attendance_id, 2, f.in2, f.out2 FROM s_saved sv
JOIN s_final f ON f.employee_id = sv.employee_id AND f.att_date = sv.attendance_date WHERE f.in2 IS NOT NULL;

-- 5. Raw biometric captures (only if the table is empty). A scan every so often is doubled a few
--    seconds later (face + thumb) so you can see the duplicate filter work. One person "forgot to punch out"
--    on the newest day, leaving an odd number of captures.
CREATE TEMP TABLE s_flag AS SELECT NOT EXISTS (SELECT 1 FROM biometric_punches) AS table_was_empty;

INSERT INTO biometric_punches (device_oid, device_emp_id, attendance_date, captured_at)
SELECT 1, f.device_id, f.att_date,
       f.att_date + c.t + make_interval(secs => ((f.ord * 7 + f.day_idx * 3 + c.n * 5) % 50)::int)
FROM s_final f
CROSS JOIN LATERAL (VALUES (1, f.in1), (2, f.out1), (3, f.in2), (4, f.out2)) AS c(n, t)
WHERE c.t IS NOT NULL AND (SELECT table_was_empty FROM s_flag)
  AND NOT (f.ord = 3 AND f.day_idx = 1 AND c.n = 4);

INSERT INTO biometric_punches (device_oid, device_emp_id, attendance_date, captured_at)
SELECT 1, f.device_id, f.att_date,
       f.att_date + c.t + make_interval(secs => ((f.ord * 7 + f.day_idx * 3 + c.n * 5) % 50)::int)
         + make_interval(secs => 2 + ((f.ord + c.n) % 9))
         + ((f.ord * 131 + c.n * 17) % 900) * INTERVAL '1 millisecond'
FROM s_final f
CROSS JOIN LATERAL (VALUES (1, f.in1), (2, f.out1), (3, f.in2), (4, f.out2)) AS c(n, t)
WHERE c.t IS NOT NULL AND (f.ord + f.day_idx + c.n) % 3 = 0
  AND NOT (f.ord = 3 AND f.day_idx = 1 AND c.n = 4)
  AND (SELECT table_was_empty FROM s_flag)
  AND NOT EXISTS (SELECT 1 FROM biometric_punches b WHERE b.device_emp_id = f.device_id AND b.attendance_date = f.att_date
                  AND b.captured_at > f.att_date + c.t + make_interval(secs => ((f.ord * 7 + f.day_idx * 3 + c.n * 5) % 50)::int) + INTERVAL '1 second'
                  AND b.captured_at < f.att_date + c.t + make_interval(secs => ((f.ord * 7 + f.day_idx * 3 + c.n * 5) % 50)::int) + INTERVAL '30 seconds');

-- 6. Attendance Rules applied to the "late a lot" person: the first 3 late arrivals (30+ min) of a month,
--    all but the newest. The newest is left for you to apply by ticking the box when you edit it.
CREATE TEMP TABLE s_new_apps AS
WITH rs AS (
    SELECT rule_set_id, name FROM attendance_rule_sets WHERE is_active AND watch = 'LATE_IN' AND org_department_id IS NULL LIMIT 1),
late AS (
    SELECT a.attendance_id, a.employee_id, a.attendance_date, a.late_in_minutes,
           row_number() OVER (PARTITION BY a.employee_id, date_trunc('month', a.attendance_date) ORDER BY a.attendance_date) AS occ,
           a.attendance_date = max(a.attendance_date) OVER (PARTITION BY a.employee_id) AS is_newest
    FROM attendance_entries a JOIN s_emps s ON s.employee_id = a.employee_id AND s.late_demo
    WHERE a.late_in_minutes >= 30 AND a.attendance_date >= CURRENT_DATE - 21),
ins AS (
    INSERT INTO attendance_rule_applications
        (attendance_id, employee_id, attendance_date, rule_set_id, rule_set_name, tier_id, watch, variance_minutes, occurrence_no, applied_by_employee_id)
    SELECT l.attendance_id, l.employee_id, l.attendance_date, rs.rule_set_id, rs.name,
           (SELECT t.tier_id FROM attendance_rule_tiers t WHERE t.rule_set_id = rs.rule_set_id AND t.occurrence_no = l.occ AND t.min_minutes <= l.late_in_minutes
            ORDER BY t.min_minutes DESC LIMIT 1),
           'LATE_IN', l.late_in_minutes, l.occ,
           (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001')
    FROM late l CROSS JOIN rs
    WHERE l.occ <= 3 AND NOT l.is_newest
      AND NOT EXISTS (SELECT 1 FROM attendance_rule_applications x WHERE x.attendance_id = l.attendance_id)
    RETURNING application_id, attendance_id, employee_id, attendance_date, variance_minutes, occurrence_no, rule_set_name
)
SELECT * FROM ins;

INSERT INTO leave_entries (employee_id, leave_type_id, kind, leave_date, amount, reason, created_by_employee_id)
SELECT n.employee_id, t.leave_type_id, 'TAKEN', n.attendance_date, CASE WHEN n.occurrence_no >= 3 THEN 1 ELSE 60 END,
       'Attendance rule: Late In ' || n.variance_minutes || ' min (' || n.rule_set_name || ', occurrence ' || n.occurrence_no || ')',
       (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001')
FROM s_new_apps n JOIN leave_types t ON t.code = CASE WHEN n.occurrence_no >= 3 THEN 'CASUAL' ELSE 'PERMISSION' END;

INSERT INTO attendance_rule_charges (application_id, action, amount, leave_entry_id)
SELECT n.application_id, CASE WHEN n.occurrence_no >= 3 THEN 'CASUAL' ELSE 'PERMISSION' END,
       CASE WHEN n.occurrence_no >= 3 THEN 1 ELSE 60 END,
       (SELECT l.leave_entry_id FROM leave_entries l WHERE l.employee_id = n.employee_id AND l.leave_date = n.attendance_date
        AND l.reason LIKE 'Attendance rule:%' ORDER BY l.leave_entry_id DESC LIMIT 1)
FROM s_new_apps n;

-- 7. Leave history (only if nobody has any yet) and shift mappings (only if there are none).
INSERT INTO leave_entries (employee_id, leave_type_id, kind, leave_date, amount, reason, created_by_employee_id)
SELECT s.employee_id, t.leave_type_id, 'TAKEN', v.d, v.amount, v.note, (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001')
FROM (VALUES (1, 'SICK', CURRENT_DATE - 30, 1::numeric, 'Fever'),
             (1, 'CASUAL', CURRENT_DATE - 12, 1::numeric, NULL),
             (2, 'PERMISSION', CURRENT_DATE - 9, 45::numeric, 'Bank visit')) AS v(o, code, d, amount, note)
JOIN (SELECT employee_id, row_number() OVER (ORDER BY ord) AS o FROM s_emps WHERE NOT late_demo) s ON s.o = v.o
JOIN leave_types t ON t.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM leave_entries WHERE kind = 'TAKEN' AND reason NOT LIKE 'Attendance rule:%');

INSERT INTO shift_mappings (employee_id, shift_id, start_date, end_date)
SELECT s.employee_id, (SELECT shift_id FROM shift_templates WHERE shift_code = 'NIGHT' LIMIT 1),
       v.start_d, v.start_d + 6
FROM (VALUES (4, CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int)),
             (5, CURRENT_DATE + (15 - EXTRACT(ISODOW FROM CURRENT_DATE)::int))) AS v(o, start_d)
JOIN s_emps s ON s.ord = v.o
WHERE NOT EXISTS (SELECT 1 FROM shift_mappings) AND EXISTS (SELECT 1 FROM shift_templates WHERE shift_code = 'NIGHT');

-- 8. Something waiting on the Approvals screens (only if nothing is pending): a new joiner and a deactivation.
INSERT INTO approval_requests (request_type, status, summary_code, summary_name, payload, requested_by_employee_id)
SELECT 'EMPLOYEE_ADD', 'PENDING', 'EMP-0101', 'Meera Nair',
  format('{"Employee":{"EmpCode":"EMP-0101","Type":"Regular","FullName":"Meera Nair","Designation":"Support Executive","DepartmentId":null,"OrgDepartmentId":%s,"CompanyId":null,"ManagerId":null,"ShiftId":%s,"RoleType":"User","Password":null,"DateOfJoining":"%s","DateOfBirth":null,"DateOfLeaving":null,"LeavingComments":null,"LocationId":null,"Email":"meera.nair@company.com","PhoneNumber":"+91 9800000101","PhotoUrl":null,"MaritalStatus":null,"Bank":null,"BiometricDeviceEmpId":"1101"},"PasswordHash":null}',
         COALESCE((SELECT org_department_id::text FROM org_departments WHERE department_name = 'Quality & Operations'), 'null'),
         COALESCE((SELECT shift_id::text FROM shift_templates WHERE shift_code = 'DAY' LIMIT 1), 'null'),
         to_char(CURRENT_DATE + 7, 'YYYY-MM-DD')),
  COALESCE((SELECT employee_id FROM employees WHERE emp_code = 'EMP-0002'), (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001'))
WHERE NOT EXISTS (SELECT 1 FROM approval_requests WHERE status = 'PENDING')
  AND NOT EXISTS (SELECT 1 FROM employees WHERE emp_code = 'EMP-0101' OR biometric_device_emp_id = '1101');

INSERT INTO approval_requests (request_type, status, target_employee_id, summary_code, summary_name, requested_by_employee_id)
SELECT 'EMPLOYEE_DELETE', 'PENDING', e.employee_id, e.emp_code, e.full_name,
       COALESCE((SELECT employee_id FROM employees WHERE emp_code = 'EMP-0002'), (SELECT employee_id FROM employees WHERE emp_code = 'SUPERADMIN-001'))
FROM employees e
WHERE e.emp_code = 'EMP-0008' AND e.status = 'Active'
  AND NOT EXISTS (SELECT 1 FROM approval_requests WHERE request_type = 'EMPLOYEE_DELETE' AND status = 'PENDING');

DROP TABLE s_flag; DROP TABLE s_new_apps; DROP TABLE s_saved; DROP TABLE s_final; DROP TABLE s_calc; DROP TABLE s_plan; DROP TABLE s_kinds; DROP TABLE s_days; DROP TABLE s_emps;
