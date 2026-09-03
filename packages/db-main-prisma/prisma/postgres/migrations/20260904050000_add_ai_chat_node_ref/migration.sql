-- V71 — Persistent, permission-checked AI Chat @ references.
CREATE TABLE IF NOT EXISTS meta.ai_chat_node_ref (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  ref_id       TEXT NOT NULL,
  label        TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_time TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_node_ref_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE,
  CONSTRAINT ai_chat_node_ref_session_kind_ref_key
    UNIQUE (session_id, kind, ref_id)
);

CREATE INDEX IF NOT EXISTS ai_chat_node_ref_session_created_idx
  ON meta.ai_chat_node_ref (session_id, created_time);
CREATE INDEX IF NOT EXISTS ai_chat_node_ref_ref_kind_idx
  ON meta.ai_chat_node_ref (ref_id, kind);
