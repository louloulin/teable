CREATE TABLE IF NOT EXISTS "audit_event" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "detail" JSONB,
  "ip_address" TEXT,
  "request_id" TEXT,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_event_organization_id_created_time_idx"
  ON "audit_event" ("organization_id", "created_time");
CREATE INDEX IF NOT EXISTS "audit_event_action_created_time_idx"
  ON "audit_event" ("action", "created_time");
CREATE INDEX IF NOT EXISTS "audit_event_actor_id_created_time_idx"
  ON "audit_event" ("actor_id", "created_time");
