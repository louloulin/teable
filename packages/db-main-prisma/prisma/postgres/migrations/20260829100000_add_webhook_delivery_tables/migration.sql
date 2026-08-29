-- Outbound webhook delivery queue and dead-letter persistence.
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'teams';

CREATE TABLE IF NOT EXISTS "webhook_endpoint" (
  "id" TEXT PRIMARY KEY,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "headers" JSONB,
  "events" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "webhook_payload" (
  "id" TEXT PRIMARY KEY,
  "event" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "webhook_delivery" (
  "id" TEXT PRIMARY KEY,
  "endpoint_id" TEXT NOT NULL REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE,
  "payload_id" TEXT NOT NULL REFERENCES "webhook_payload"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_status_code" INTEGER,
  "last_error" TEXT,
  "last_attempt_at" TIMESTAMP(3),
  "finalized_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "webhook_delivery_due_idx" ON "webhook_delivery" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "webhook_delivery_dead_idx" ON "webhook_delivery" ("status");
