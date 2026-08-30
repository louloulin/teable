CREATE TABLE IF NOT EXISTS "ai_field" (
    "id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "source_field_ids" TEXT NOT NULL,
    "config_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "config_hash" TEXT NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_field_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_field_base_id_table_id_field_id_operation_key"
  ON "ai_field"("base_id", "table_id", "field_id", "operation");
CREATE INDEX IF NOT EXISTS "ai_field_base_id_table_id_idx"
  ON "ai_field"("base_id", "table_id");

CREATE TABLE IF NOT EXISTS "ai_field_run" (
    "id" TEXT NOT NULL,
    "ai_field_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "input_text" TEXT NOT NULL,
    "output_text" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "ai_field_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_field_run_ai_field_id_started_at_idx"
  ON "ai_field_run"("ai_field_id", "started_at");

CREATE TABLE IF NOT EXISTS "ai_field_template" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'english',
    "name" TEXT NOT NULL,
    "prompt_template" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_field_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_field_template_operation_language_name_key"
  ON "ai_field_template"("operation", "language", "name");
