-- ─────────────────────────────────────────────────────────────────────────────
-- Quota / SLA tracking (additive, no destructive changes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Targets the same Postgres main database the rest of the system uses. All
-- identifiers, indexes and constraints match `schema.prisma` 1:1 so the next
-- `prisma migrate dev` regenerates an idempotent diff (no-op).
-- Safe to apply on a populated database; default values are backfilled for
-- every existing space.
-- ─────────────────────────────────────────────────────────────────────────────

-- enums
CREATE TYPE "PlanLevel" AS ENUM ('free', 'pro', 'business', 'enterprise', 'self_hosted');
CREATE TYPE "QuotaMetric" AS ENUM (
  'rows',
  'attachment_bytes',
  'automation_runs',
  'ai_credits',
  'api_requests',
  'record_history_days',
  'automation_history_days',
  'seats'
);

-- space_quota
CREATE TABLE "space_quota" (
  "id"                         TEXT NOT NULL,
  "space_id"                   TEXT NOT NULL,
  "plan"                       "PlanLevel" NOT NULL DEFAULT 'free',
  "row_limit"                  INTEGER,
  "attachment_byte_limit"      BIGINT,
  "automation_run_limit"       INTEGER,
  "ai_credit_limit"            INTEGER,
  "api_request_limit_per_sec"  INTEGER,
  "record_history_days"        INTEGER,
  "automation_history_days"    INTEGER,
  "seat_limit"                 INTEGER,
  "row_addon"                  INTEGER,
  "automation_addon"           INTEGER,
  "ai_credit_addon"            INTEGER,
  "attachment_byte_addon"      BIGINT,
  "effective_from"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"                 TEXT,
  CONSTRAINT "space_quota_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "space_quota_space_id_key" ON "space_quota"("space_id");

-- space_usage_counter
CREATE TABLE "space_usage_counter" (
  "id"              BIGSERIAL NOT NULL,
  "space_id"        TEXT NOT NULL,
  "metric"          "QuotaMetric" NOT NULL,
  "period_start"    DATE NOT NULL,
  "period_kind"     VARCHAR(16) NOT NULL DEFAULT 'monthly',
  "used"            BIGINT NOT NULL DEFAULT 0,
  "cap_snapshot"    BIGINT,
  "last_event_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_usage_counter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "space_usage_counter_space_id_metric_period_kind_period_start_key"
  ON "space_usage_counter"("space_id", "metric", "period_kind", "period_start");
CREATE INDEX "space_usage_counter_space_id_metric_idx"
  ON "space_usage_counter"("space_id", "metric");
CREATE INDEX "space_usage_counter_period_start_idx"
  ON "space_usage_counter"("period_start");

-- quota_hit
CREATE TABLE "quota_hit" (
  "id"           BIGSERIAL NOT NULL,
  "space_id"     TEXT NOT NULL,
  "metric"       "QuotaMetric" NOT NULL,
  "attempted"    BIGINT NOT NULL,
  "cap"          BIGINT NOT NULL,
  "actor_id"     TEXT,
  "resource"     TEXT,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quota_hit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quota_hit_space_id_metric_created_time_idx"
  ON "quota_hit"("space_id", "metric", "created_time");

-- Backfill: every existing space gets a `self_hosted` quota row with all
-- caps NULL (= unlimited by convention; the service treats NULL as -1).
INSERT INTO "space_quota" ("id", "space_id", "plan")
SELECT 'quota-init-' || "id", "id", 'self_hosted'
FROM "space"
WHERE "deleted_time" IS NULL
ON CONFLICT ("space_id") DO NOTHING;