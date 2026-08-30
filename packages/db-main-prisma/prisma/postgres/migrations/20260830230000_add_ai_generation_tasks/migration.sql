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
