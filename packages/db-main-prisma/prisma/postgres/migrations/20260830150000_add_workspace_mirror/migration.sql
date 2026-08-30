CREATE TABLE IF NOT EXISTS "mirror_log" (
  "id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "seq" INTEGER NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mirror_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mirror_log_base_id_region_seq_idx"
  ON "mirror_log" ("base_id", "region", "seq");

CREATE TABLE IF NOT EXISTS "mirror_lag" (
  "base_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "last_ack_seq" INTEGER NOT NULL,
  "shipped_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mirror_lag_pkey" PRIMARY KEY ("base_id", "region")
);

CREATE INDEX IF NOT EXISTS "mirror_lag_base_id_idx"
  ON "mirror_lag" ("base_id");
