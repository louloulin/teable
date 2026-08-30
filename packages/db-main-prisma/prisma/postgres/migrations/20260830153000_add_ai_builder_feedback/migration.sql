CREATE TABLE IF NOT EXISTS "ai_builder_feedback" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "edit_magnitude" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_builder_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_builder_feedback_base_id_recorded_at_idx"
  ON "ai_builder_feedback"("base_id", "recorded_at");

CREATE INDEX IF NOT EXISTS "ai_builder_feedback_proposal_id_idx"
  ON "ai_builder_feedback"("proposal_id");
