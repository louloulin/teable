-- V85 -- Billing usage event ledger (Phase 5.5 part 1)
--
-- Append-only event log of metered consumption. Every billable feature
-- (AI credits, automation runs, record overage, storage growth, email
-- sends) writes one row per event. Aggregation happens on read inside
-- `[period_start, period_end)` for a given organization.
--
-- Idempotency: `(organization_id, idempotency_key)` is unique so a
-- retried write from a worker becomes a no-op rather than a double
-- charge. `metric` is a string label so the schema can stay closed
-- while new metrics are added without a migration.

CREATE TABLE IF NOT EXISTS "billing_usage_event" (
    "id"              TEXT PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "metric"          TEXT NOT NULL,
    "quantity"        BIGINT NOT NULL DEFAULT 0,
    "period_start"    TIMESTAMP(3) NOT NULL,
    "period_end"      TIMESTAMP(3) NOT NULL,
    "source"          TEXT NOT NULL,
    "idempotency_key" TEXT,
    "metadata"        JSONB,
    "recorded_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_usage_event_org_idempotency_key_key"
    ON "billing_usage_event"("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "billing_usage_event_org_metric_period_idx"
    ON "billing_usage_event"("organization_id", "metric", "period_start", "period_end");

CREATE INDEX IF NOT EXISTS "billing_usage_event_metric_recorded_at_idx"
    ON "billing_usage_event"("metric", "recorded_at");
