-- Migration: add organization_integration table (Stage 15)
-- Stores credentials for IM bridges (Slack, Discord, Telegram).
-- Token stored as opaque text; encryption is applied at the application
-- layer via OrgIntegrationService.encryptToken() (AES-256-GCM).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'IntegrationProvider' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "IntegrationProvider" AS ENUM ('slack', 'discord', 'telegram');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_integration" (
  "id"              TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "provider"        "IntegrationProvider" NOT NULL,
  "external_ref"    TEXT NOT NULL,                 -- channel id / chat id / webhook path
  "encrypted_token" TEXT,                          -- AES-256-GCM ciphertext (base64)
  "config"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by"      TEXT NOT NULL,
  "created_time"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_modified_time" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "organization_integration_org_provider_idx"
  ON "organization_integration" ("organization_id", "provider");
