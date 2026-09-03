-- V49 — AI Chat Long Tasks (Cloud §ai/ai-chat 24h background execution)
-- Stage 49: tracks long-running AI tasks separate from per-turn messages.

CREATE TABLE IF NOT EXISTS meta.ai_chat_long_task (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  user_message_id TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'queued',
  progress        INT  NOT NULL DEFAULT 0,
  result          TEXT,
  error_message   TEXT,
  error_code      TEXT,
  idempotency_key TEXT,
  attempt         INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  heartbeat_at    TIMESTAMP(3),
  lease_until     TIMESTAMP(3),
  retry_at        TIMESTAMP(3),
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  tenant_id       TEXT,
  correlation_id  TEXT,
  context         TEXT,
  started_at      TIMESTAMP(3),
  completed_at    TIMESTAMP(3),
  created_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_long_task_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE,
  CONSTRAINT ai_chat_long_task_msg_fk
    FOREIGN KEY (user_message_id) REFERENCES meta.ai_chat_message(id) ON DELETE CASCADE
);

ALTER TABLE meta.ai_chat_long_task
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS retry_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS context TEXT;

ALTER TABLE meta.ai_chat_long_task
  ALTER COLUMN status SET DEFAULT 'queued';

CREATE INDEX IF NOT EXISTS ai_chat_long_task_session_status_idx
  ON meta.ai_chat_long_task (session_id, status);

CREATE INDEX IF NOT EXISTS ai_chat_long_task_status_created_idx
  ON meta.ai_chat_long_task (status, created_time);

CREATE INDEX IF NOT EXISTS ai_chat_long_task_status_lease_idx
  ON meta.ai_chat_long_task (status, lease_until);

CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_long_task_session_idempotency_idx
  ON meta.ai_chat_long_task (session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
