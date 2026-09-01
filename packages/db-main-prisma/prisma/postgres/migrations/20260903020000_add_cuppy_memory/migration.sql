-- V12 — Cuppy long-term memory persistence
-- Cloud §ai/ai-chat 'Memory' feature: real DB-backed memory instead of in-memory scratchpad.

CREATE TABLE IF NOT EXISTS meta.cuppy_memory (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cuppy_memory_conversation_id_key_unique UNIQUE (conversation_id, key)
);

CREATE INDEX IF NOT EXISTS cuppy_memory_conversation_id_idx ON meta.cuppy_memory (conversation_id);
