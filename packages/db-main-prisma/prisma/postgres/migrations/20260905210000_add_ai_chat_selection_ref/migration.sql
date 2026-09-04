-- V81 R-CHAT-1 — AI Chat selection references (Grid row/column/cell/range chips).
CREATE TABLE IF NOT EXISTS meta.ai_chat_selection_ref (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  table_id        TEXT NOT NULL,
  view_id         TEXT,
  selection_type  TEXT NOT NULL CHECK (selection_type IN ('row', 'column', 'cell', 'range')),
  ref_key         TEXT NOT NULL,
  ref_value       JSONB NOT NULL,
  display_label   TEXT NOT NULL,
  row_count       INTEGER,
  created_by      TEXT NOT NULL,
  created_time    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_chat_selection_ref_session_fk
    FOREIGN KEY (session_id) REFERENCES meta.ai_chat_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_chat_selection_ref_session_created_idx
  ON meta.ai_chat_selection_ref (session_id, created_time);
CREATE INDEX IF NOT EXISTS ai_chat_selection_ref_session_table_idx
  ON meta.ai_chat_selection_ref (session_id, table_id);
