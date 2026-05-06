-- ═══════════════════════════════════════════════════
-- ROOM TYPES MIGRATION
-- An-Najah Faculty of Engineering
-- ═══════════════════════════════════════════════════

-- Update existing enum values
ALTER TYPE room_type RENAME VALUE 'classroom' TO 'lecture_hall';

-- Add new room types
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'lab';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'office';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'bathroom';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'amphitheater';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'professor_lounge';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'storage';

-- Update existing rooms
UPDATE rooms SET type = 'lecture_hall' WHERE type::text = 'classroom';

COMMIT;
