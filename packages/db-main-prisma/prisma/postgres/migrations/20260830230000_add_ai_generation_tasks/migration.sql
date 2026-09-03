CREATE TABLE IF NOT EXISTS "ai_generation_task" (
    "id" TEXT NOT NULL,
    "space_id" TEXT,
    "base_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "total_count" INTEGER NOT NULL,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "started_time" TIMESTAMP(3),
    "finished_time" TIMESTAMP(3),
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_generation_task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_generation_task_status_created_time_idx"
  ON "ai_generation_task"("status", "created_time");
CREATE INDEX IF NOT EXISTS "ai_generation_task_space_id_status_idx"
  ON "ai_generation_task"("space_id", "status");

ALTER TABLE "ai_generation_task"
  ADD COLUMN IF NOT EXISTS "error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;

CREATE INDEX IF NOT EXISTS "ai_generation_task_status_lease_until_idx"
  ON "ai_generation_task"("status", "lease_until");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_generation_task_table_id_idempotency_key_idx"
  ON "ai_generation_task"("table_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
