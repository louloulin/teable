-- V13 — Cuppy Artifact persistence
-- Cloud §ai/ai-chat 'Artifact' feature: chart/report/card with versions
-- persisted to PostgreSQL so they survive backend restart.

CREATE TABLE IF NOT EXISTS meta.cuppy_artifact (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  content         TEXT NOT NULL,
  versions        JSONB NOT NULL,
  shared          BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS cuppy_artifact_conversation_id_idx
  ON meta.cuppy_artifact (conversation_id);
