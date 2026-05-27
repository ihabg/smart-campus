-- ─── Event Bookings ───────────────────────────────────────────────────────────
-- Stores admin-created event bookings that reserve a room for a specific date/time.
-- When confirmed (Step 2), conflicting lectures will be tracked via
-- section_meeting_changes (change_scope = 'single_day', event_booking_id = this id).

CREATE TABLE IF NOT EXISTS event_bookings (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  room_id     UUID         NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  event_date  DATE         NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  created_by  UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'cancelled')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_bookings_room_date
  ON event_bookings (room_id, event_date);

CREATE INDEX IF NOT EXISTS idx_event_bookings_status
  ON event_bookings (status);
