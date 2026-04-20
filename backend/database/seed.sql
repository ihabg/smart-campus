-- ============================================================
-- Seed Data — An-Najah Engineering Faculty
-- ============================================================

-- Buildings (Engineering Blocks)
INSERT INTO buildings (id, code, name, description, is_active) VALUES
  ('11111111-0000-0000-0000-000000000001', '585', 'Engineering Block 585', 'Main engineering building section A', TRUE),
  ('11111111-0000-0000-0000-000000000002', '589', 'Engineering Block 589', 'Main engineering building section B', TRUE),
  ('11111111-0000-0000-0000-000000000003', '593', 'Engineering Block 593', 'Main engineering building section C', TRUE),
  ('11111111-0000-0000-0000-000000000004', '597', 'Engineering Block 597', 'Main engineering building section D', TRUE),
  ('11111111-0000-0000-0000-000000000005', '601', 'Engineering Block 601', 'Main engineering building section E', TRUE),
  ('11111111-0000-0000-0000-000000000006', '605', 'Engineering Block 605', 'Main engineering building section F', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Floors for Block 597
INSERT INTO floors (id, building_id, floor_number, floor_label, name, display_order, is_active) VALUES
  ('22222222-0000-0000-0000-000000000501', '11111111-0000-0000-0000-000000000004', 5,  'F5', 'Block 597 — Floor 5',  1, TRUE),
  ('22222222-0000-0000-0000-000000000502', '11111111-0000-0000-0000-000000000004', 6,  'F6', 'Block 597 — Floor 6',  2, TRUE),
  ('22222222-0000-0000-0000-000000000503', '11111111-0000-0000-0000-000000000004', 7,  'F7', 'Block 597 — Floor 7',  3, TRUE),
  ('22222222-0000-0000-0000-000000000504', '11111111-0000-0000-0000-000000000004', 8,  'F8', 'Block 597 — Floor 8',  4, TRUE),
  ('22222222-0000-0000-0000-000000000505', '11111111-0000-0000-0000-000000000004', 9,  'F9', 'Block 597 — Floor 9',  5, TRUE)
ON CONFLICT (building_id, floor_number) DO NOTHING;

-- Departments
-- (stored as strings in courses/users, no separate table needed for MVP)

-- Admin user
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified)
VALUES (
  '33333333-0000-0000-0000-000000000001',
  'admin@najah.edu',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGiCsGxpkIvxhO.xDjY9nGl9hXu', -- 'Admin@1234'
  'System',
  'Admin',
  'super_admin',
  'active',
  TRUE
) ON CONFLICT (email) DO NOTHING;

-- Courses (Computer Engineering)
INSERT INTO courses (code, name, department, credit_hours) VALUES
  ('CE201', 'Data Structures',             'Computer Engineering', 3),
  ('CE202', 'Algorithms Analysis',         'Computer Engineering', 3),
  ('CE301', 'Computer Networks',           'Computer Engineering', 3),
  ('CE302', 'Operating Systems',           'Computer Engineering', 3),
  ('CE303', 'Database Systems',            'Computer Engineering', 3),
  ('CE304', 'Software Engineering',        'Computer Engineering', 3),
  ('CE401', 'Artificial Intelligence',     'Computer Engineering', 3),
  ('CE402', 'Web Development',             'Computer Engineering', 3),
  ('CE403', 'Mobile Development',          'Computer Engineering', 3),
  ('CE404', 'Computer Architecture',       'Computer Engineering', 3),
  ('EE201', 'Digital Logic Design',        'Electrical Engineering', 3),
  ('EE202', 'Electronics I',               'Electrical Engineering', 3),
  ('EE301', 'Signals and Systems',         'Electrical Engineering', 3),
  ('EE302', 'Digital Electronics',         'Electrical Engineering', 3),
  ('ME201', 'Thermodynamics',              'Mechanical Engineering', 3),
  ('ME202', 'Fluid Mechanics',             'Mechanical Engineering', 3),
  ('CE101', 'Engineering Drawing',         'Civil Engineering', 2),
  ('MATH201','Calculus II',               'Mathematics', 3),
  ('MATH202','Linear Algebra',            'Mathematics', 3),
  ('PHYS201','Physics II',               'Physics', 3)
ON CONFLICT (code) DO NOTHING;
