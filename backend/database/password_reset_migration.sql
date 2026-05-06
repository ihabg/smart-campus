-- ═══════════════════════════════════════════════════
-- PASSWORD RESET & 2FA MIGRATION
-- ═══════════════════════════════════════════════════

-- OTP / verification codes table
CREATE TABLE IF NOT EXISTS verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        VARCHAR(6) NOT NULL,
  type        VARCHAR(30) NOT NULL, -- 'password_reset' | 'password_change_2fa'
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);

COMMIT;
