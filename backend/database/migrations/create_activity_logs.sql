-- Activity Logs: immutable audit trail of admin/system actions
CREATE TABLE IF NOT EXISTS activity_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_name   TEXT,
  actor_role   TEXT,
  action       TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_label TEXT,
  description  TEXT,
  metadata     JSONB       DEFAULT '{}',
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at  ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id    ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action      ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON activity_logs(entity_type);
