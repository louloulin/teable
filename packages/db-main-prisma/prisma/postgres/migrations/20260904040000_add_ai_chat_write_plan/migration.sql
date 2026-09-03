-- AI Chat write confirmation protocol: plan first, explicit confirmation second.
CREATE TABLE IF NOT EXISTS meta.ai_chat_write_plan (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  base_id         TEXT NOT NULL,
  table_id        TEXT NOT NULL,
  operation       TEXT NOT NULL,
  payload         JSONB NOT NULL,
  summary         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  expires_at      TIMESTAMP(3) NOT NULL,
  confirmed_by    TEXT,
  confirmed_time  TIMESTAMP(3),
  executed_time   TIMESTAMP(3),
  result          JSONB,
  error_message   TEXT,
  created_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_write_plan_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_chat_write_plan_session_created_idx
  ON meta.ai_chat_write_plan (session_id, created_time);
CREATE INDEX IF NOT EXISTS ai_chat_write_plan_user_status_expiry_idx
  ON meta.ai_chat_write_plan (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS ai_chat_write_plan_table_status_idx
  ON meta.ai_chat_write_plan (table_id, status);
