INSERT INTO event_booking_rooms (event_booking_id, room_id)
SELECT id, room_id
FROM   event_bookings
WHERE  room_id IS NOT NULL
ON CONFLICT (event_booking_id, room_id) DO NOTHING;
