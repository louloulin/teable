-- Migration: add OAuth 2.0 server tables (Stage 16)
-- 3 tables: oauth_application, oauth_authorization_code, oauth_access_token
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS "oauth_application" (
  "id"                 TEXT PRIMARY KEY,
  "client_id"          TEXT NOT NULL UNIQUE,
  "client_secret_hash" TEXT NOT NULL,            -- scrypt(pass, salt) format
  "name"               TEXT NOT NULL,
  "redirect_uris"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "scopes"             JSONB NOT NULL DEFAULT '["read"]'::jsonb,
  "created_by"         TEXT NOT NULL,
  "created_time"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_modified_time" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "oauth_application_client_id_idx" ON "oauth_application" ("client_id");

CREATE TABLE IF NOT EXISTS "oauth_authorization_code" (
  "id"             TEXT PRIMARY KEY,
  "code_hash"      TEXT NOT NULL UNIQUE,         -- scrypt(code) for at-rest safety
  "application_id" TEXT NOT NULL REFERENCES "oauth_application"("id") ON DELETE CASCADE,
  "user_id"        TEXT NOT NULL,
  "redirect_uri"   TEXT NOT NULL,
  "scope"          TEXT NOT NULL,
  "code_challenge" TEXT,                          -- PKCE (RFC 7636)
  "code_challenge_method" TEXT,                   -- 'S256' or 'plain'
  "expires_at"     TIMESTAMP(3) NOT NULL,
  "consumed_at"    TIMESTAMP(3),
  "created_time"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "oauth_authorization_code_expires_idx"
  ON "oauth_authorization_code" ("expires_at");

CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id"               TEXT PRIMARY KEY,
  "token_hash"       TEXT NOT NULL UNIQUE,       -- sha256 hex of access token
  "refresh_hash"     TEXT,                        -- sha256 hex of refresh token (nullable)
  "application_id"   TEXT NOT NULL REFERENCES "oauth_application"("id") ON DELETE CASCADE,
  "user_id"          TEXT NOT NULL,
  "scope"            TEXT NOT NULL,
  "expires_at"       TIMESTAMP(3) NOT NULL,
  "refresh_expires_at" TIMESTAMP(3),
  "revoked_at"       TIMESTAMP(3),
  "created_time"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "oauth_access_token_user_idx"
  ON "oauth_access_token" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_expires_idx"
  ON "oauth_access_token" ("expires_at");
