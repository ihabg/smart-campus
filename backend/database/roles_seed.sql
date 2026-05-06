-- ═══════════════════════════════════════════════════════
-- SEED DATA — An-Najah Faculty of Engineering Staff
-- Smart Campus Navigation System
-- ═══════════════════════════════════════════════════════
-- Passwords are all: Staff@1234

-- ── Dean ─────────────────────────────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, academic_title, specialization)
VALUES (
  gen_random_uuid(),
  'Abdullah', 'Rashid',
  'dean@najah.edu',
  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', -- Staff@1234
  'dean', 'active',
  'Computer Engineering',
  'Prof. Dr.',
  'Computer Engineering & AI'
) ON CONFLICT (email) DO NOTHING;

-- ── Department Heads ──────────────────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, academic_title, specialization)
VALUES
  (gen_random_uuid(), 'Ahmad',     'Hasan',     'head.ece@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'department_head', 'active', 'Electrical & Computer Engineering', 'Dr.', 'Electrical Engineering'),
  (gen_random_uuid(), 'Khalid',    'Mansour',   'head.ime@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'department_head', 'active', 'Industrial & Mechanical Engineering', 'Dr.', 'Mechanical Engineering'),
  (gen_random_uuid(), 'Samer',     'Nabulsi',   'head.ace@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'department_head', 'active', 'Architectural & Civil Engineering', 'Dr.', 'Civil Engineering'),
  (gen_random_uuid(), 'Lina',      'Barakat',   'head.ics@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'department_head', 'active', 'Information & Computer Science', 'Dr.', 'Computer Science'),
  (gen_random_uuid(), 'Mohammed',  'Salah',     'head.che@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'department_head', 'active', 'Chemical Engineering', 'Dr.', 'Chemical Engineering')
ON CONFLICT (email) DO NOTHING;

-- ── Professors — ECE Department ──────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, academic_title, specialization)
VALUES
  (gen_random_uuid(), 'Yousef',   'Sabbah',    'y.sabbah@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Electrical & Computer Engineering', 'Dr.', 'Power Systems & Renewable Energy'),
  (gen_random_uuid(), 'Wael',     'Farhan',    'w.farhan@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Electrical & Computer Engineering', 'Dr.', 'Telecommunication Engineering'),
  (gen_random_uuid(), 'Nidal',    'Jaber',     'n.jaber@najah.edu',    '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Electrical & Computer Engineering', 'Dr.', 'Computer Architecture & VLSI')
ON CONFLICT (email) DO NOTHING;

-- ── Professors — ICS Department ──────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, academic_title, specialization)
VALUES
  (gen_random_uuid(), 'Samer',    'Zein',      's.zein@najah.edu',     '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Information & Computer Science', 'Dr.', 'Software Engineering & AI'),
  (gen_random_uuid(), 'Rana',     'Khatib',    'r.khatib@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Information & Computer Science', 'Dr.', 'Computer Networks & Security'),
  (gen_random_uuid(), 'Feras',    'Tamimi',    'f.tamimi@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Information & Computer Science', 'Dr.', 'Database Systems & Big Data')
ON CONFLICT (email) DO NOTHING;

-- ── Professors — IME Department ──────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, academic_title, specialization)
VALUES
  (gen_random_uuid(), 'Ibrahim',  'Surakji',   'i.surakji@najah.edu',  '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Industrial & Mechanical Engineering', 'Dr.', 'Mechanical Engineering & CAD'),
  (gen_random_uuid(), 'Saed',     'Musmar',    's.musmar@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'professor', 'active', 'Industrial & Mechanical Engineering', 'Dr.', 'Industrial Engineering')
ON CONFLICT (email) DO NOTHING;

-- ── Lab Assistants ────────────────────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department, specialization)
VALUES
  (gen_random_uuid(), 'Bilal',   'Tamimi',    'lab.cs@najah.edu',      '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'lab_assistant', 'active', 'Information & Computer Science', 'Computer Science Lab'),
  (gen_random_uuid(), 'Rania',   'Hamed',     'lab.net@najah.edu',     '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'lab_assistant', 'active', 'Electrical & Computer Engineering', 'Networks Lab'),
  (gen_random_uuid(), 'Omar',    'Zidan',     'lab.mech@najah.edu',    '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'lab_assistant', 'active', 'Industrial & Mechanical Engineering', 'Mechanical Engineering Lab')
ON CONFLICT (email) DO NOTHING;

-- ── Secretary ─────────────────────────────────────────────
INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, department)
VALUES
  (gen_random_uuid(), 'Hiba',    'Saleh',     'secretary@najah.edu',   '$2a$12$1ndh.EicWHA5qBf4WHS.HObwxY6bALTS1sKSXUy8K4Uxrk2.d2EKi', 'secretary', 'active', 'Faculty of Engineering')
ON CONFLICT (email) DO NOTHING;

-- ── Update department heads ───────────────────────────────
UPDATE engineering_departments
SET head_id = (SELECT id FROM users WHERE email = 'head.ece@najah.edu')
WHERE code = 'ECE';

UPDATE engineering_departments
SET head_id = (SELECT id FROM users WHERE email = 'head.ime@najah.edu')
WHERE code = 'IME';

UPDATE engineering_departments
SET head_id = (SELECT id FROM users WHERE email = 'head.ace@najah.edu')
WHERE code = 'ACE';

UPDATE engineering_departments
SET head_id = (SELECT id FROM users WHERE email = 'head.ics@najah.edu')
WHERE code = 'ICS';

UPDATE engineering_departments
SET head_id = (SELECT id FROM users WHERE email = 'head.che@najah.edu')
WHERE code = 'CHE';

COMMIT;
