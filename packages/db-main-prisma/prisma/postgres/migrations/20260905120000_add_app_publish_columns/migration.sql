-- AI App Builder — publish + public URL (Round 45)
--
-- Adds public_slug + published_at to app_instance so operators can
-- publish a deployed app and reference it by URL slug (mirrors Cloud's
-- `app.teable.ai/a/<slug>` pattern). Public slug is a globally-unique
-- 12-char base36 string; we also index on it so the future runtime
-- endpoint (`GET /a/<slug>`) can resolve the app in O(log n).
--
-- Idempotent: safe on hot-fixed DBs (ALTER TABLE IF NOT EXISTS / ADD
-- COLUMN IF NOT EXISTS, partial unique index guarded by WHERE clause).

ALTER TABLE "app_instance"
  ADD COLUMN IF NOT EXISTS "public_slug"   TEXT,
  ADD COLUMN IF NOT EXISTS "published_at"  TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "app_instance_public_slug_uq"
  ON "app_instance" ("public_slug")
  WHERE "public_slug" IS NOT NULL;

-- Mirror columns into the meta schema where the Prisma client queries.
SET search_path TO meta, public;

ALTER TABLE "app_instance"
  ADD COLUMN IF NOT EXISTS "public_slug"   TEXT,
  ADD COLUMN IF NOT EXISTS "published_at"  TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "app_instance_meta_public_slug_uq"
  ON "app_instance" ("public_slug")
  WHERE "public_slug" IS NOT NULL;
