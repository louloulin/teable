-- V86 -- Billing add-on subscriptions (Phase 5.5 part 2)
--
-- Stacks on top of the base plan: extra AI credits, automation runs,
-- record overage allowance, storage GB. Each row represents one active
-- pack for one period; when the period ends the worker flips the row
-- to `expired` and creates a new `active` row for the next period if
-- the add-on has not been canceled.

CREATE TABLE IF NOT EXISTS "billing_add_on" (
    "id"                   TEXT PRIMARY KEY,
    "organization_id"      TEXT NOT NULL,
    "metric"               TEXT NOT NULL,
    "pack_code"            TEXT NOT NULL,
    "granted_quantity"     BIGINT NOT NULL DEFAULT 0,
    "monthly_price_cents"  INTEGER NOT NULL,
    "currency"             TEXT NOT NULL DEFAULT 'usd',
    "status"               TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end"   TIMESTAMP(3) NOT NULL,
    "canceled_at"          TIMESTAMP(3),
    "created_time"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_time"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_add_on_org_pack_period_key"
        UNIQUE ("organization_id", "pack_code", "current_period_start")
);

CREATE INDEX IF NOT EXISTS "billing_add_on_organization_id_status_idx"
    ON "billing_add_on"("organization_id", "status");
