-- ============================================================
-- Smart Campus Navigation System — Database Schema
-- PostgreSQL 14+
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy search

-- ============================================================
-- USERS
-- ============================================================

CREATE TYPE user_role AS ENUM ('student', 'admin', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');

CREATE TABLE IF NOT EXISTS users (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id        VARCHAR(20)  UNIQUE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              user_role    NOT NULL DEFAULT 'student',
  status            user_status  NOT NULL DEFAULT 'active',
  department        VARCHAR(100),
  year_of_study     SMALLINT     CHECK (year_of_study BETWEEN 1 AND 6),
  avatar_url        VARCHAR(500),
  fcm_token         TEXT,                     -- Firebase push token
  refresh_token     TEXT,
  last_login        TIMESTAMPTZ,
  password_reset_token   VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  email_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_role       ON users(role);

-- ============================================================
-- BUILDINGS / BLOCKS
-- ============================================================

CREATE TABLE IF NOT EXISTS buildings (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. '597', '601'
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  latitude    DECIMAL(10,7),
  longitude   DECIMAL(10,7),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FLOORS
-- ============================================================

CREATE TABLE IF NOT EXISTS floors (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id  UUID         NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_number SMALLINT     NOT NULL,          -- e.g. 5, 6, 7, 8, 9
  floor_label  VARCHAR(20)  NOT NULL,          -- e.g. 'F7', 'Ground'
  name         VARCHAR(200),                  -- e.g. 'Engineering Floor 7'
  map_image_url VARCHAR(500),                 -- URL of uploaded floor map image
  map_width    INTEGER,                       -- original image width (px)
  map_height   INTEGER,                       -- original image height (px)
  svg_data     TEXT,                          -- optional: raw SVG floor plan
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  display_order SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(building_id, floor_number)
);

CREATE INDEX idx_floors_building ON floors(building_id);

-- ============================================================
-- ROOM TYPES
-- ============================================================

CREATE TYPE room_type AS ENUM (
  'classroom',
  'lecture_hall',
  'lab',
  'office',
  'corridor',
  'restroom',
  'elevator',
  'stairs',
  'storage',
  'atrium',
  'meeting_room',
  'library',
  'cafeteria',
  'other'
);

-- ============================================================
-- ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS rooms (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  floor_id     UUID         NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  room_number  VARCHAR(20)  NOT NULL,           -- e.g. '103', '161', 'WC-1'
  name         VARCHAR(200) NOT NULL,           -- e.g. 'Lecture Hall A'
  type         room_type    NOT NULL DEFAULT 'classroom',
  department   VARCHAR(100),
  capacity     SMALLINT,
  description  TEXT,
  -- Map coordinates (relative to map image, 0-100% scale)
  coord_x      DECIMAL(6,2),                   -- left % on floor map
  coord_y      DECIMAL(6,2),                   -- top  % on floor map
  coord_width  DECIMAL(6,2),                   -- width % on floor map
  coord_height DECIMAL(6,2),                   -- height % on floor map
  -- Polygon points for irregular shapes: JSON array of {x,y} objects
  polygon_points JSONB,
  -- Metadata
  features     JSONB,                          -- e.g. {"projector": true, "ac": true}
  is_accessible BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(floor_id, room_number)
);

CREATE INDEX idx_rooms_floor        ON rooms(floor_id);
CREATE INDEX idx_rooms_number       ON rooms(room_number);
CREATE INDEX idx_rooms_type         ON rooms(type);
CREATE INDEX idx_rooms_search       ON rooms USING gin(to_tsvector('english', name || ' ' || room_number || ' ' || COALESCE(department,'')));

-- ============================================================
-- ADJACENCY (Graph for Pathfinding)
-- ============================================================

CREATE TABLE IF NOT EXISTS room_adjacency (
  id         UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_a_id  UUID  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_b_id  UUID  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  weight     DECIMAL(8,2) NOT NULL DEFAULT 1.0,  -- distance/cost
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_a_id, room_b_id)
);

CREATE INDEX idx_adjacency_a ON room_adjacency(room_a_id);
CREATE INDEX idx_adjacency_b ON room_adjacency(room_b_id);

-- ============================================================
-- COURSES
-- ============================================================

CREATE TABLE IF NOT EXISTS courses (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. 'CS301'
  name        VARCHAR(200) NOT NULL,
  name_ar     VARCHAR(200),
  department  VARCHAR(100) NOT NULL,
  credit_hours SMALLINT,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_code ON courses(code);
CREATE INDEX idx_courses_dept ON courses(department);

-- ============================================================
-- INSTRUCTORS
-- ============================================================

CREATE TABLE IF NOT EXISTS instructors (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  title       VARCHAR(50),                    -- Dr., Prof., Eng.
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(255),
  department  VARCHAR(100),
  office_room_id UUID      REFERENCES rooms(id) ON DELETE SET NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTIONS (a specific offering of a course in a semester)
-- ============================================================

CREATE TYPE semester_type AS ENUM ('fall', 'spring', 'summer');

CREATE TABLE IF NOT EXISTS sections (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id     UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  instructor_id UUID         REFERENCES instructors(id) ON DELETE SET NULL,
  room_id       UUID         REFERENCES rooms(id) ON DELETE SET NULL,
  semester      semester_type NOT NULL,
  academic_year VARCHAR(9)   NOT NULL,         -- e.g. '2025/2026'
  section_number VARCHAR(10) NOT NULL,
  day_of_week   SMALLINT[]  NOT NULL,          -- 0=Sun,1=Mon…6=Sat
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  max_capacity  SMALLINT,
  enrolled      SMALLINT     NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sections_course      ON sections(course_id);
CREATE INDEX idx_sections_instructor  ON sections(instructor_id);
CREATE INDEX idx_sections_room        ON sections(room_id);
CREATE INDEX idx_sections_semester    ON sections(semester, academic_year);

-- ============================================================
-- STUDENT ENROLLMENTS
-- ============================================================

CREATE TYPE enrollment_status AS ENUM ('enrolled', 'dropped', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  UUID              NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  status      enrollment_status NOT NULL DEFAULT 'enrolled',
  grade       VARCHAR(5),
  enrolled_at TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, section_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_section ON enrollments(section_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TYPE notification_type AS ENUM (
  'announcement',
  'schedule_change',
  'room_change',
  'exam_reminder',
  'system',
  'custom'
);

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(300)      NOT NULL,
  body          TEXT              NOT NULL,
  type          notification_type NOT NULL DEFAULT 'announcement',
  sender_id     UUID              REFERENCES users(id) ON DELETE SET NULL,
  target_role   user_role,                    -- NULL = all users
  target_dept   VARCHAR(100),                 -- NULL = all departments
  related_room_id UUID            REFERENCES rooms(id) ON DELETE SET NULL,
  data          JSONB,                        -- extra payload
  is_published  BOOLEAN           NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_published ON notifications(is_published, published_at DESC);

-- ============================================================
-- USER NOTIFICATION RECEIPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_receipts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notification_id, user_id)
);

CREATE INDEX idx_receipts_user   ON notification_receipts(user_id, is_read);
CREATE INDEX idx_receipts_notif  ON notification_receipts(notification_id);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       VARCHAR(300) NOT NULL,
  content     TEXT        NOT NULL,
  image_url   VARCHAR(500),
  author_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_pinned   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_published BOOLEAN    NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_published ON announcements(is_published, published_at DESC);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(100),
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user      ON audit_log(user_id);
CREATE INDEX idx_audit_table     ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_created   ON audit_log(created_at DESC);

-- ============================================================
-- updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','buildings','floors','rooms','courses',
    'instructors','sections','enrollments','announcements'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
