CREATE TABLE IF NOT EXISTS event_booking_rooms (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_booking_id  UUID        NOT NULL REFERENCES event_bookings(id) ON DELETE CASCADE,
  room_id           UUID        NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_booking_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_ebr_event_id ON event_booking_rooms (event_booking_id);
CREATE INDEX IF NOT EXISTS idx_ebr_room_id  ON event_booking_rooms (room_id);
