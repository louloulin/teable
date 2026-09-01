-- V14 — Cuppy @-node references persistence
-- Cloud §ai/ai-chat '@' feature: attach table/view/app/automation/folder to chat context.

CREATE TABLE IF NOT EXISTS meta.cuppy_node_ref (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind            TEXT NOT NULL,
  ref_id          TEXT NOT NULL,
  label           TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS cuppy_node_ref_conversation_id_idx
  ON meta.cuppy_node_ref (conversation_id);
