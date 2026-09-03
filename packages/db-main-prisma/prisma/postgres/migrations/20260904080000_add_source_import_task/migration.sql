-- V49 — Unified source-import task model (Cloud §migrations)
-- Adds the durable-task protocol columns shared with AI Chat long task,
-- AI Field batch, and Stripe webhook events.

CREATE TABLE IF NOT EXISTS "source_import_task" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "space_id" TEXT,
  "base_id" TEXT,
  "table_id" TEXT,
  "remote_id" TEXT,
  "triggered_by" TEXT,
  "tenant_id" TEXT,
  "correlation_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "total_count" INTEGER NOT NULL DEFAULT 0,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "heartbeat_at" TIMESTAMP(3),
  "lease_until" TIMESTAMP(3),
  "retry_at" TIMESTAMP(3),
  "cancel_requested" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_error" TEXT,
  "error_code" TEXT,
  "payload" JSONB,
  "result" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_import_task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "source_import_task_status_created_time_idx"
  ON "source_import_task"("status", "created_time");
CREATE INDEX IF NOT EXISTS "source_import_task_source_status_idx"
  ON "source_import_task"("source", "status");
CREATE INDEX IF NOT EXISTS "source_import_task_status_lease_until_idx"
  ON "source_import_task"("status", "lease_until");

CREATE UNIQUE INDEX IF NOT EXISTS "source_import_task_source_idempotency_key_idx"
  ON "source_import_task"("source", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
