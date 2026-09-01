-- Repair for databases that applied 20260901010000 before the runtime
-- schema was recognized. Idempotent by design.
CREATE SCHEMA IF NOT EXISTS "meta";
SET search_path TO meta, public;
CREATE TABLE IF NOT EXISTS "compliance_audit_pack" (
  "id" TEXT PRIMARY KEY,
  "framework" TEXT NOT NULL,
  "period_from" TEXT NOT NULL,
  "period_to" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "content_hash" TEXT NOT NULL,
  "total_bytes" INTEGER NOT NULL,
  "artifact_count" INTEGER NOT NULL,
  "artifacts" JSONB NOT NULL,
  "created_by" TEXT,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_audit_pack_content_hash_key"
  ON "compliance_audit_pack" ("content_hash");
CREATE INDEX IF NOT EXISTS "compliance_audit_pack_generated_at_idx"
  ON "compliance_audit_pack" ("generated_at");
CREATE INDEX IF NOT EXISTS "compliance_audit_pack_created_time_idx"
  ON "compliance_audit_pack" ("created_time");
