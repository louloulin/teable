-- 20260824220000_add_permission_role_tables
-- Permission matrix scaffolding. Mirrors the guide at
-- help.teable.cn/zh/basic/authority-matrix/authority-matrix-practical-guide.
--
-- Tables:
--   permission_role                 — custom role per base
--   permission_role_member          — many-to-many user <-> role
--   permission_role_node            — per-table access (none / editable)
--   permission_role_field_permission — per-field access (hidden/readonly/editable)
--   permission_role_record_action   — which record actions (view/update/create/delete/comment)
--   permission_role_record_filter   — row-level filter (JSON DSL, supports "current user")

DO $$ BEGIN
  CREATE TYPE "PermissionRoleStatus" AS ENUM ('enabled', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PermissionNodeAccess" AS ENUM ('none', 'editable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PermissionFieldAccess" AS ENUM ('hidden', 'readonly', 'editable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PermissionRecordAction" AS ENUM ('view', 'update', 'create', 'delete', 'comment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "permission_role" (
  "id"          TEXT PRIMARY KEY,
  "base_id"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "status"      "PermissionRoleStatus" NOT NULL DEFAULT 'enabled',
  "created_by"  TEXT NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_base_name_uq" UNIQUE ("base_id", "name")
);
CREATE INDEX IF NOT EXISTS "permission_role_base_idx" ON "permission_role" ("base_id");

CREATE TABLE IF NOT EXISTS "permission_role_member" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL REFERENCES "permission_role"("id") ON DELETE CASCADE,
  "user_id"    TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_member_role_user_uq" UNIQUE ("role_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "permission_role_member_user_idx" ON "permission_role_member" ("user_id");

CREATE TABLE IF NOT EXISTS "permission_role_node" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL REFERENCES "permission_role"("id") ON DELETE CASCADE,
  "table_id"   TEXT NOT NULL,
  "access"     "PermissionNodeAccess" NOT NULL DEFAULT 'editable',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_node_role_table_uq" UNIQUE ("role_id", "table_id")
);

CREATE TABLE IF NOT EXISTS "permission_role_field_permission" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL REFERENCES "permission_role"("id") ON DELETE CASCADE,
  "table_id"   TEXT NOT NULL,
  "field_id"   TEXT NOT NULL,
  "access"     "PermissionFieldAccess" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_field_role_field_uq" UNIQUE ("role_id", "field_id")
);

CREATE TABLE IF NOT EXISTS "permission_role_record_action" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL REFERENCES "permission_role"("id") ON DELETE CASCADE,
  "table_id"   TEXT NOT NULL,
  "action"     "PermissionRecordAction" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_record_action_role_table_action_uq"
    UNIQUE ("role_id", "table_id", "action")
);

CREATE TABLE IF NOT EXISTS "permission_role_record_filter" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL REFERENCES "permission_role"("id") ON DELETE CASCADE,
  "table_id"   TEXT NOT NULL,
  "filter"     JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_role_record_filter_role_table_uq"
    UNIQUE ("role_id", "table_id")
);
