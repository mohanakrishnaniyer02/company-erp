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
