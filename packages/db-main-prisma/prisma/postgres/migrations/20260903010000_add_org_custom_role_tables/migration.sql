-- Organization-level custom roles and assignments.
-- The NestJS service and Prisma models were added before the database
-- migration; keep these tables in the Prisma meta schema where the client
-- resolves the CustomRole and RoleAssignment models.

CREATE TABLE IF NOT EXISTS "custom_role" (
  "id"           TEXT PRIMARY KEY,
  "org_id"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "capabilities" TEXT[] NOT NULL,
  "scopes"       JSONB[] NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_role_org_name_uq" UNIQUE ("org_id", "name")
);

CREATE INDEX IF NOT EXISTS "custom_role_org_id_idx" ON "custom_role" ("org_id");

CREATE TABLE IF NOT EXISTS "role_assignment" (
  "id"         TEXT PRIMARY KEY,
  "org_id"     TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "role_id"    TEXT NOT NULL,
  "base_id"    TEXT,
  "granted_at" TIMESTAMPTZ NOT NULL,
  "granted_by" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "role_assignment_org_user_idx"
  ON "role_assignment" ("org_id", "user_id");
CREATE INDEX IF NOT EXISTS "role_assignment_user_idx"
  ON "role_assignment" ("user_id");
