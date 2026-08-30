CREATE TABLE IF NOT EXISTS "ai_usage_bucket" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "event_count" INTEGER NOT NULL DEFAULT 0,
  "month_bucket" TEXT NOT NULL,
  "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_bucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_bucket_organization_id_model_action_month_bucket_key"
  ON "ai_usage_bucket" ("organization_id", "model", "action", "month_bucket");
CREATE INDEX IF NOT EXISTS "ai_usage_bucket_organization_id_month_bucket_idx"
  ON "ai_usage_bucket" ("organization_id", "month_bucket");
