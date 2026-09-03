-- V83 — Stripe webhook event status machine (Phase 1 unification)
-- Adds the same durable-task protocol columns used by AI Chat long task
-- and AI Field batch generation so Stripe webhooks survive restarts,
-- reclaim expired leases, and dedupe replays with bounded retries.

ALTER TABLE "stripe_webhook_event"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "stripe_webhook_event_status_lease_until_idx"
  ON "stripe_webhook_event"("status", "lease_until");
