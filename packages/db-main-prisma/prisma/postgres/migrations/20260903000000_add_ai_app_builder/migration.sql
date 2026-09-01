-- AI App Builder (Cloud §AI §App Builder, help.teable.ai/en/basic/ai/app-builder).
-- Minimal R-AI-4 surface: app_instance (top-level), app_version (snapshot history),
-- app_secret (write-only keys), app_file (sandbox), plus two enums for status.
-- Idempotent: safe on hot-fixed DBs.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_status') THEN
    CREATE TYPE "app_status" AS ENUM ('draft', 'deployed', 'archived');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_version_status') THEN
    CREATE TYPE "app_version_status" AS ENUM ('draft', 'deployed', 'rolled_back');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "app_instance" (
  "id"                 TEXT PRIMARY KEY,
  "base_id"            TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "description"        TEXT,
  "current_version_id" TEXT,
  "status"             "app_status" NOT NULL DEFAULT 'draft',
  "created_by"         TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_instance_base_id_name_uq" UNIQUE ("base_id", "name")
);
CREATE INDEX IF NOT EXISTS "app_instance_base_id_idx" ON "app_instance" ("base_id");
CREATE UNIQUE INDEX IF NOT EXISTS "app_instance_current_version_id_uq"
  ON "app_instance" ("current_version_id");

CREATE TABLE IF NOT EXISTS "app_version" (
  "id"             TEXT PRIMARY KEY,
  "app_id"         TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "snapshot"       JSONB NOT NULL,
  "source_prompt"  TEXT,
  "status"         "app_version_status" NOT NULL DEFAULT 'draft',
  "deployed_at"    TIMESTAMP(3),
  "deployed_by"    TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_version_app_id_version_number_uq" UNIQUE ("app_id", "version_number")
);
CREATE INDEX IF NOT EXISTS "app_version_app_id_idx" ON "app_version" ("app_id");

CREATE TABLE IF NOT EXISTS "app_secret" (
  "id"                TEXT PRIMARY KEY,
  "app_id"            TEXT NOT NULL,
  "key"               TEXT NOT NULL,
  "value_ciphertext"  TEXT NOT NULL,
  "description"       TEXT,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_secret_app_id_key_uq" UNIQUE ("app_id", "key")
);
CREATE INDEX IF NOT EXISTS "app_secret_app_id_idx" ON "app_secret" ("app_id");

CREATE TABLE IF NOT EXISTS "app_file" (
  "id"         TEXT PRIMARY KEY,
  "app_id"     TEXT NOT NULL,
  "path"       TEXT NOT NULL,
  "content"    TEXT NOT NULL DEFAULT '',
  "size_bytes"  INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_file_app_id_path_uq" UNIQUE ("app_id", "path")
);
CREATE INDEX IF NOT EXISTS "app_file_app_id_idx" ON "app_file" ("app_id");

-- Mirror tables into the meta schema where the Prisma client (configured with
-- schema='meta') actually queries. The public mirror is mostly vestigial —
-- we keep it for symmetry with the other permission-* tables that exist in
-- both schemas. Both schemas get IF NOT EXISTS so re-runs are safe.

SET search_path TO meta, public;

CREATE TABLE IF NOT EXISTS "app_instance" (
  "id"                 TEXT PRIMARY KEY,
  "base_id"            TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "description"        TEXT,
  "current_version_id" TEXT,
  "status"             "app_status" NOT NULL DEFAULT 'draft',
  "created_by"         TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_instance_meta_base_id_name_uq" UNIQUE ("base_id", "name")
);
CREATE INDEX IF NOT EXISTS "app_instance_meta_base_id_idx"
  ON "app_instance" ("base_id");
CREATE UNIQUE INDEX IF NOT EXISTS "app_instance_meta_current_version_id_uq"
  ON "app_instance" ("current_version_id");

CREATE TABLE IF NOT EXISTS "app_version" (
  "id"             TEXT PRIMARY KEY,
  "app_id"         TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "snapshot"       JSONB NOT NULL,
  "source_prompt"  TEXT,
  "status"         "app_version_status" NOT NULL DEFAULT 'draft',
  "deployed_at"    TIMESTAMP(3),
  "deployed_by"    TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_version_meta_app_id_version_number_uq" UNIQUE ("app_id", "version_number")
);
CREATE INDEX IF NOT EXISTS "app_version_meta_app_id_idx" ON "app_version" ("app_id");

CREATE TABLE IF NOT EXISTS "app_secret" (
  "id"                TEXT PRIMARY KEY,
  "app_id"            TEXT NOT NULL,
  "key"               TEXT NOT NULL,
  "value_ciphertext"  TEXT NOT NULL,
  "description"       TEXT,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_secret_meta_app_id_key_uq" UNIQUE ("app_id", "key")
);
CREATE INDEX IF NOT EXISTS "app_secret_meta_app_id_idx" ON "app_secret" ("app_id");

CREATE TABLE IF NOT EXISTS "app_file" (
  "id"         TEXT PRIMARY KEY,
  "app_id"     TEXT NOT NULL,
  "path"       TEXT NOT NULL,
  "content"    TEXT NOT NULL DEFAULT '',
  "size_bytes" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_file_meta_app_id_path_uq" UNIQUE ("app_id", "path")
);
CREATE INDEX IF NOT EXISTS "app_file_meta_app_id_idx" ON "app_file" ("app_id");
