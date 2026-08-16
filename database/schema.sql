-- ============================================================
-- Company HR / ERP  —  PostgreSQL schema
-- ============================================================

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

-- ---------------- Auth ----------------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(20)  NOT NULL DEFAULT 'User'
                   CHECK (role IN ('User','HR','Admin','SuperAdmin')),
    jwt_token      TEXT,                       -- last-issued token, per spec (no refresh flow)
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------- Lookups ----------------
CREATE TABLE companies (
    company_id        SERIAL PRIMARY KEY,
    company_name      VARCHAR(150) NOT NULL,
    is_sub_company     BOOLEAN NOT NULL DEFAULT FALSE,
    parent_company_id INT REFERENCES companies(company_id)
);

CREATE TABLE locations (
    location_id   SERIAL PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE departments (
    department_id   SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE
);

-- ---------------- Core employee ----------------
CREATE TABLE employees (
    employee_id       SERIAL PRIMARY KEY,
    emp_code          VARCHAR(30)  NOT NULL UNIQUE,      -- e.g. EMP-2026-0143
    type              VARCHAR(20)  NOT NULL DEFAULT 'Regular'
                      CHECK (type IN ('Regular','Contract')),
    full_name         VARCHAR(150) NOT NULL,
    designation       VARCHAR(150),
    department_id     INT REFERENCES departments(department_id),
    company_id        INT REFERENCES companies(company_id),
    manager_id        INT REFERENCES employees(employee_id),
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

-- ---------------- Sub pages (1-to-many off employees) ----------------
CREATE TABLE employee_bank_details (
    bank_detail_id  SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    bank_name       VARCHAR(150),
    account_number  VARCHAR(40),
    ifsc_code       VARCHAR(20),
    branch_name     VARCHAR(150),
    esi_number      VARCHAR(30),
    pan_number      VARCHAR(20),
    UNIQUE(employee_id)          -- one primary bank record per employee
);

CREATE TABLE employee_proof (
    proof_id        SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    proof_type      VARCHAR(50) NOT NULL,        -- Aadhaar / PAN / Passport / Driving Licence
    proof_number    VARCHAR(50) NOT NULL,
    attachment_url  TEXT
);

CREATE TABLE employee_address (
    address_id                SERIAL PRIMARY KEY,
    employee_id                INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    address_type               VARCHAR(20) NOT NULL CHECK (address_type IN ('Current','Permanent')),
    address_line1               VARCHAR(200),
    address_line2               VARCHAR(200),
    address_line3               VARCHAR(200),
    emergency_person            VARCHAR(150),
    emergency_contact_number    VARCHAR(20),
    UNIQUE(employee_id, address_type)
);

CREATE TABLE employee_education (
    education_id      SERIAL PRIMARY KEY,
    employee_id       INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    institution_name  VARCHAR(200),
    degree            VARCHAR(150),
    completion_date   DATE
);

-- ---------------- Shift templates (reusable, then assigned) ----------------
CREATE TABLE shift_templates (
    shift_id      SERIAL PRIMARY KEY,
    shift_name    VARCHAR(100) NOT NULL,       -- e.g. "Day Shift"
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    is_next_day   BOOLEAN NOT NULL DEFAULT FALSE,
    break1_start  TIME,
    break1_end    TIME,
    break2_start  TIME,
    break2_end    TIME,
    lunch_start   TIME,
    lunch_end     TIME
);

CREATE TABLE employee_shift_assignment (
    assignment_id   SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    shift_id        INT NOT NULL REFERENCES shift_templates(shift_id),
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(employee_id, effective_from)
);

-- ============================================================
-- Seed data
-- ============================================================

INSERT INTO companies (company_name, is_sub_company, parent_company_id) VALUES
 ('Company Tech Pvt Ltd', FALSE, NULL);
INSERT INTO companies (company_name, is_sub_company, parent_company_id) VALUES
 ('Company Logistics', TRUE, 1),
 ('Company Retail', TRUE, 1);

INSERT INTO locations (location_name) VALUES ('Chennai'),('Bengaluru'),('Pune'),('Remote');

INSERT INTO departments (department_name) VALUES ('Product'),('Engineering'),('Finance'),('HR');

INSERT INTO shift_templates (shift_name, start_time, end_time, is_next_day, break1_start, break1_end, break2_start, break2_end, lunch_start, lunch_end) VALUES
 ('Day Shift',   '09:30','18:30', FALSE, '11:00','11:15','16:00','16:15','13:00','13:30'),
 ('Night Shift', '21:30','06:30', TRUE,  '23:30','23:45','03:30','03:45','01:30','02:00');

-- No seeded user account here on purpose. The users table starts genuinely empty,
-- so your very first real signup through the app becomes the bootstrap SuperAdmin
-- (see AuthController.Signup — self-service signup only allows User/HR roles,
-- EXCEPT when the users table is completely empty).

INSERT INTO employees (emp_code, type, full_name, designation, department_id, company_id, manager_id, date_of_joining, date_of_birth, location_id, email, phone_number, marital_status, status) VALUES
 ('EMP-2021-0007','Regular','Karthik Rajan','Engineering Manager', 2, 1, NULL, '2019-06-11','1988-02-10', 2, 'karthik.r@company.co','+91 9800000002','Married','Active'),
 ('EMP-2026-0143','Regular','Ananya Iyer','Senior Product Analyst', 1, 1, 1, '2023-03-04','1994-07-12', 1, 'ananya.i@company.co','+91 9800000021','Single','Active'),
 ('EMP-2024-0088','Contract','Zoya Khan','Financial Analyst', 3, 3, NULL, '2024-01-15','1996-11-02', 3, 'zoya.k@company.co','+91 9800000045','Single','Active'),
 ('EMP-2022-0031','Regular','Rahul Verma','HR Executive', 4, 1, NULL, '2020-09-01','1991-05-19', 1, 'rahul.v@company.co','+91 9800000078','Married','Inactive'),
 ('EMP-2025-0102','Contract','Meera Nair','QA Engineer', 2, 2, 1, '2025-02-20','1997-08-30', 4, 'meera.n@company.co','+91 9800000019','Single','Active');

INSERT INTO employee_shift_assignment (employee_id, shift_id, effective_from) VALUES
 (1,1,'2019-06-11'), (2,1,'2023-03-04'), (3,1,'2024-01-15'), (4,1,'2020-09-01'), (5,2,'2025-02-20');
