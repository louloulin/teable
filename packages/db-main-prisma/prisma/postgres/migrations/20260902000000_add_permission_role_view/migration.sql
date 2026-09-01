-- Permission role view-level visibility (Cloud Business §权限矩阵 §视图权限).
-- Per the Cloud docs (help.teable.ai/zh/basic/authority-matrix), within a table
-- marked "可编辑" the role can either see ALL views or a SPECIFIC list of view IDs.
-- We model the SPECIFIC case as rows in this table; empty = ALL views visible
-- (default, no rows needed). Idempotent so safe on hot-fixed DBs.

CREATE TABLE IF NOT EXISTS "permission_role_view" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL,
  "table_id"   TEXT NOT NULL,
  "view_id"    TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "permission_role_view_role_table_view_uq"
  ON "permission_role_view" ("role_id", "table_id", "view_id");
CREATE INDEX IF NOT EXISTS "permission_role_view_role_table_idx"
  ON "permission_role_view" ("role_id", "table_id");
