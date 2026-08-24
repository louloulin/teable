-- 20260824210000_add_sso_tables
-- SSO scaffolding: IdP registry + short-lived login state. Mirrors the
-- minimal data model that the OSS repo needs to plumb OIDC for the
-- Business plan without colliding with `teableio/teable-ee`.

-- 1. Provider-type + connection-status enums.
DO $$ BEGIN
  CREATE TYPE "SsoProviderType" AS ENUM ('oidc', 'saml');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SsoConnectionStatus" AS ENUM ('pending', 'active', 'disabled', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. IdP registry.
CREATE TABLE IF NOT EXISTS "sso_identity_provider" (
  "id"              TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "issuer"          TEXT NOT NULL,
  "client_id"       TEXT,
  "client_secret"   TEXT,
  "discovery_url"   TEXT,
  "email_domain"    TEXT NOT NULL,
  "type"            "SsoProviderType" NOT NULL DEFAULT 'oidc',
  "status"          "SsoConnectionStatus" NOT NULL DEFAULT 'pending',
  "last_error"      TEXT,
  "last_checked_at" TIMESTAMPTZ,
  "created_by"      TEXT NOT NULL,
  "created_time"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One IdP per org/email-domain pair; allows multiple IdPs per org (e.g.
-- acquired company with a different IdP) but never duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "sso_identity_provider_org_domain_uq"
  ON "sso_identity_provider" ("organization_id", "email_domain");
CREATE INDEX IF NOT EXISTS "sso_identity_provider_issuer_idx"
  ON "sso_identity_provider" ("issuer");
CREATE INDEX IF NOT EXISTS "sso_identity_provider_status_idx"
  ON "sso_identity_provider" ("status");

-- 3. Short-lived state table for the OAuth2 callback round-trip.
CREATE TABLE IF NOT EXISTS "sso_login_state" (
  "id"              TEXT PRIMARY KEY,
  "state"           TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider_id"     TEXT NOT NULL,
  "email_hint"      TEXT,
  "redirect_to"     TEXT,
  "consumed"        BOOLEAN NOT NULL DEFAULT FALSE,
  "expires_at"      TIMESTAMPTZ NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sso_login_state_state_uq"
  ON "sso_login_state" ("state");
CREATE INDEX IF NOT EXISTS "sso_login_state_expires_idx"
  ON "sso_login_state" ("expires_at");
