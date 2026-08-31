-- Permission role import/export gate (Cloud Business §权限矩阵 §导入/导出权限).
-- Independent axis from recordAction: one row per (role, table) with
-- canImport + canExport booleans. Idempotent so safe on hot-fixed DBs.

CREATE TABLE IF NOT EXISTS "permission_role_import_export" (
  "id"         TEXT PRIMARY KEY,
  "role_id"    TEXT NOT NULL,
  "table_id"   TEXT NOT NULL,
  "can_import" BOOLEAN NOT NULL DEFAULT FALSE,
  "can_export" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "permission_role_import_export_role_table_uq"
  ON "permission_role_import_export" ("role_id", "table_id");
CREATE INDEX IF NOT EXISTS "permission_role_import_export_role_idx"
  ON "permission_role_import_export" ("role_id");
