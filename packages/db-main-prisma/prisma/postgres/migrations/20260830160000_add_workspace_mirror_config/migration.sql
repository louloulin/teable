CREATE TABLE IF NOT EXISTS "workspace_mirror_config" (
    "base_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_mirror_config_pkey" PRIMARY KEY ("base_id")
);

CREATE INDEX IF NOT EXISTS "workspace_mirror_config_created_by_idx"
  ON "workspace_mirror_config"("created_by");
