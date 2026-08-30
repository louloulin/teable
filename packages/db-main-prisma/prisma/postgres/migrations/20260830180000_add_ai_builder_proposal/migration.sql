CREATE TABLE IF NOT EXISTS "ai_builder_proposal" (
    "id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source_prompt" TEXT NOT NULL,
    "proposal_json" TEXT NOT NULL,
    "proposal_hash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_time" TIMESTAMP(3),
    "applied_resource_id" TEXT,
    CONSTRAINT "ai_builder_proposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_builder_proposal_base_id_status_idx"
  ON "ai_builder_proposal"("base_id", "status");

CREATE INDEX IF NOT EXISTS "ai_builder_proposal_base_id_created_time_idx"
  ON "ai_builder_proposal"("base_id", "created_time");
