-- V84 -- Dunning plan + step tables (Phase 5.3 part 1)
--
-- When a subscription transitions into `past_due`, BillingAuthService opens
-- one BillingDunningPlan and pre-schedules four BillingDunningStep rows
-- (T+24h email / T+72h retry attempt / T+7d final notice / T+14d cancel).
-- The worker (separate process, next phase) scans
-- `status = 'scheduled' AND due_at <= now()` and atomically claims rows
-- by transitioning them to `executed` or `canceled`.

CREATE TABLE IF NOT EXISTS "billing_dunning_plan" (
    "id"              TEXT PRIMARY KEY,
    "subscription_id" TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "reason"          TEXT,
    "opened_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at"     TIMESTAMP(3),
    "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "billing_dunning_plan_subscription_id_status_idx"
    ON "billing_dunning_plan"("subscription_id", "status");
CREATE INDEX IF NOT EXISTS "billing_dunning_plan_status_resolved_at_idx"
    ON "billing_dunning_plan"("status", "resolved_at");

CREATE TABLE IF NOT EXISTS "billing_dunning_step" (
    "id"           TEXT PRIMARY KEY,
    "plan_id"      TEXT NOT NULL REFERENCES "billing_dunning_plan"("id") ON DELETE CASCADE,
    "kind"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'scheduled',
    "due_at"       TIMESTAMP(3) NOT NULL,
    "executed_at"  TIMESTAMP(3),
    "canceled_at"  TIMESTAMP(3),
    "result"       JSONB,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_dunning_step_plan_id_kind_key" UNIQUE ("plan_id", "kind")
);

CREATE INDEX IF NOT EXISTS "billing_dunning_step_plan_id_due_at_idx"
    ON "billing_dunning_step"("plan_id", "due_at");
CREATE INDEX IF NOT EXISTS "billing_dunning_step_status_due_at_idx"
    ON "billing_dunning_step"("status", "due_at");
