-- ═══════════════════════════════════════════════════════════════
-- ROLES MIGRATION — An-Najah Faculty of Engineering
-- Smart Campus Navigation System
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Update role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dean';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_head';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'secretary';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'professor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'lab_assistant';

-- Step 2: Add professor/staff fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS office_room_id UUID REFERENCES rooms(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS academic_title VARCHAR(50) DEFAULT 'Dr.';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_room_id UUID REFERENCES rooms(id);

-- Step 3: Room real-time availability table
CREATE TABLE IF NOT EXISTS room_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  is_occupied     BOOLEAN NOT NULL DEFAULT false,
  occupied_by     UUID REFERENCES users(id),
  course_name     VARCHAR(200),
  instructor_name VARCHAR(200),
  started_at      TIMESTAMP WITH TIME ZONE,
  ends_at         TIMESTAMP WITH TIME ZONE,
  note            TEXT,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id)
);

-- Step 4: Department structure
CREATE TABLE IF NOT EXISTS engineering_departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(200) NOT NULL,
  name_ar     VARCHAR(200),
  head_id     UUID REFERENCES users(id),
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Professor-department relationship
CREATE TABLE IF NOT EXISTS professor_departments (
  professor_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES engineering_departments(id) ON DELETE CASCADE,
  PRIMARY KEY (professor_id, department_id)
);

-- Step 6: Seed An-Najah Engineering departments
INSERT INTO engineering_departments (code, name, name_ar, description) VALUES
('ECE',  'Electrical & Computer Engineering',    'هندسة الكهرباء والحاسوب',
 'Covers Electrical Engineering, Computer Engineering, and Telecommunication Engineering'),
('IME',  'Industrial & Mechanical Engineering',  'الهندسة الصناعية والميكانيكية',
 'Covers Mechanical Engineering, Industrial Engineering, and Mechatronics'),
('ACE',  'Architectural & Civil Engineering',    'الهندسة المعمارية والمدنية',
 'Covers Civil Engineering, Architectural Engineering, Building Engineering, and Urban Planning'),
('ICS',  'Information & Computer Science',       'علوم المعلومات والحاسوب',
 'Covers Computer Science, Software Engineering, and Networking & Information Security'),
('CHE',  'Chemical Engineering',                 'الهندسة الكيميائية',
 'Chemical Engineering and Energy & Environmental Engineering')
ON CONFLICT (code) DO NOTHING;

-- Step 7: Indexes
CREATE INDEX IF NOT EXISTS idx_room_status_room     ON room_status(room_id);
CREATE INDEX IF NOT EXISTS idx_room_status_occupied ON room_status(is_occupied);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department     ON users(department);

COMMIT;
