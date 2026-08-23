-- ============================================================
-- Company HR / ERP — PostgreSQL schema
-- ============================================================

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
    late_after_minutes      INT NOT NULL DEFAULT 0,
    early_out_minutes       INT NOT NULL DEFAULT 0,
    minimum_work_minutes    INT NOT NULL DEFAULT 0,
    half_day_minutes        INT NOT NULL DEFAULT 240,
    full_day_minutes        INT NOT NULL DEFAULT 480,
    ot_allowed              BOOLEAN NOT NULL DEFAULT TRUE,
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
    department_id     INT REFERENCES departments(department_id),
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
    approved_ot_minutes   INT NOT NULL DEFAULT 0,
    reason                TEXT,
    created_by_user_id    INT REFERENCES employees(employee_id),
    created_at            TIMESTAMP NOT NULL DEFAULT now(),
    updated_at            TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(employee_id, attendance_date)
);
CREATE INDEX idx_attendance_date ON attendance_entries(attendance_date);
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

-- One working bootstrap SuperAdmin account, seeded directly as an employee —
-- no public signup exists anymore. Log in with this once, you'll be forced
-- to set your own password immediately (must_change_password), then use the
-- Employee form to add real Admin/HR people for the organization.
--   Email:    superadmin@company.co
--   Password: ChangeMe123!
INSERT INTO employees (emp_code, type, full_name, role_type, email, password_hash, must_change_password, status) VALUES
 ('SUPERADMIN-001', 'Regular', 'System Administrator', 'SuperAdmin', 'superadmin@company.co', '$2b$11$Z9xV0Rh/BjRctSqbT2oEFO1XkR7UbH.2zpk8/TGmom6F/VujYNTX6', TRUE, 'Active');

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
 grace_in_minutes, grace_out_minutes, late_after_minutes, early_out_minutes,
 minimum_work_minutes, half_day_minutes, full_day_minutes, ot_allowed,
 ot_start_after_minutes, is_night_shift, status)
VALUES
('DAY', 'Day Shift', '09:30','18:30','13:00','13:30',10,10,10,10,240,240,480,TRUE,0,FALSE,'Active'),
('NIGHT', 'Night Shift', '21:30','06:30','01:30','02:00',10,10,10,10,240,240,480,TRUE,0,TRUE,'Active');

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

INSERT INTO employees
(emp_code, type, full_name, designation, department_id, company_id, manager_id, shift_id, role_type,
 date_of_joining, date_of_birth, location_id, email, phone_number, marital_status, status)
VALUES
('EMP-2021-0007','Regular','Karthik Rajan','Engineering Manager',2,1,NULL,1,'Admin','2019-06-11','1988-02-10',2,'karthik.r@company.co','+91 9800000002','Married','Active'),
('EMP-2026-0143','Regular','Ananya Iyer','Senior Product Analyst',1,1,1,1,'User','2023-03-04','1994-07-12',1,'ananya.i@company.co','+91 9800000021','Single','Active'),
('EMP-2024-0088','Contract','Zoya Khan','Financial Analyst',3,3,NULL,1,'User','2024-01-15','1996-11-02',3,'zoya.k@company.co','+91 9800000045','Single','Active'),
('EMP-2022-0031','Regular','Rahul Verma','HR Executive',4,1,NULL,1,'HR','2020-09-01','1991-05-19',1,'rahul.v@company.co','+91 9800000078','Married','Inactive'),
('EMP-2025-0102','Contract','Meera Nair','QA Engineer',2,2,1,2,'User','2025-02-20','1997-08-30',4,'meera.n@company.co','+91 9800000019','Single','Active');

INSERT INTO employee_shift_assignment (employee_id, shift_id, effective_from) VALUES
(1,1,'2019-06-11'),(2,1,'2023-03-04'),(3,1,'2024-01-15'),(4,1,'2020-09-01'),(5,2,'2025-02-20');
