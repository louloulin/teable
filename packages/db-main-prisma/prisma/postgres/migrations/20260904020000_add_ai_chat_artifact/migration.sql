-- V50 — AI Chat Artifacts (Cloud §ai/ai-chat Artifact viewer)
-- Stage 50: persistent AI-generated outputs (charts, reports, HTML pages).

CREATE TABLE IF NOT EXISTS meta.ai_chat_artifact (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  message_id      TEXT,
  format          TEXT NOT NULL DEFAULT 'markdown',
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  version         INT  NOT NULL DEFAULT 1,
  created_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_artifact_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_chat_artifact_session_created_idx
  ON meta.ai_chat_artifact (session_id, created_time);

CREATE INDEX IF NOT EXISTS ai_chat_artifact_format_idx
  ON meta.ai_chat_artifact (format);
