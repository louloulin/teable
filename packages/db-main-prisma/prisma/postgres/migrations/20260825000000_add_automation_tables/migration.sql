-- Migration: add automation engine tables (Stage 13)
-- 4 tables: automation, automation_trigger, automation_action, automation_run
-- All idempotent; safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AutomationTriggerType' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "AutomationTriggerType" AS ENUM ('record_created', 'record_updated', 'record_deleted', 'schedule');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AutomationActionType' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "AutomationActionType" AS ENUM ('update_record', 'webhook', 'email', 'slack', 'discord', 'telegram');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AutomationRunStatus' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "AutomationRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "automation" (
  "id"              TEXT PRIMARY KEY,
  "base_id"         TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "created_by"      TEXT NOT NULL,
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_modified_by" TEXT,
  "last_modified_time" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "automation_base_id_idx" ON "automation" ("base_id");

CREATE TABLE IF NOT EXISTS "automation_trigger" (
  "id"              TEXT PRIMARY KEY,
  "automation_id"   TEXT NOT NULL REFERENCES "automation"("id") ON DELETE CASCADE,
  "type"            "AutomationTriggerType" NOT NULL,
  "table_id"        TEXT,
  "config"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "automation_trigger_automation_id_idx" ON "automation_trigger" ("automation_id");
CREATE INDEX IF NOT EXISTS "automation_trigger_type_idx" ON "automation_trigger" ("type");

CREATE TABLE IF NOT EXISTS "automation_action" (
  "id"              TEXT PRIMARY KEY,
  "automation_id"   TEXT NOT NULL REFERENCES "automation"("id") ON DELETE CASCADE,
  "type"            "AutomationActionType" NOT NULL,
  "order_index"     INTEGER NOT NULL DEFAULT 0,
  "config"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "automation_action_automation_id_idx" ON "automation_action" ("automation_id");

CREATE TABLE IF NOT EXISTS "automation_run" (
  "id"              TEXT PRIMARY KEY,
  "automation_id"   TEXT NOT NULL REFERENCES "automation"("id") ON DELETE CASCADE,
  "trigger_type"    "AutomationTriggerType" NOT NULL,
  "status"          "AutomationRunStatus" NOT NULL DEFAULT 'pending',
  "input"           JSONB NOT NULL DEFAULT '{}'::jsonb,
  "output"          JSONB,
  "error"           TEXT,
  "retry_count"     INTEGER NOT NULL DEFAULT 0,
  "started_at"      TIMESTAMP(3),
  "finished_at"     TIMESTAMP(3),
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "automation_run_automation_id_idx" ON "automation_run" ("automation_id");
CREATE INDEX IF NOT EXISTS "automation_run_status_idx" ON "automation_run" ("status");
CREATE INDEX IF NOT EXISTS "automation_run_created_time_idx" ON "automation_run" ("created_time" DESC);
