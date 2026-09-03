-- V60 — AI Chat Message Queue (Cloud §ai/ai-chat 消息队列)
-- Stage 60: user messages sent while AI is busy; processed in order after
-- the current turn completes. Users can cancel or reorder them.

CREATE TABLE IF NOT EXISTS meta.ai_chat_queued_message (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  user_message      TEXT NOT NULL,
  position          INT  NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',
  result_message_id TEXT,
  error_message     TEXT,
  created_time      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_time      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_queued_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_chat_queued_session_status_position_idx
  ON meta.ai_chat_queued_message (session_id, status, position);
