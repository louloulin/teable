-- Extend permission_role_node to carry app/workflow node access (Cloud §权限矩阵
-- "节点权限" sub-types). All statements are idempotent so re-applying the
-- migration on a hot-fixed database is safe.

-- 1. New enum type for node category (table | app | workflow)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'PermissionNodeType') THEN
    CREATE TYPE "PermissionNodeType" AS ENUM ('table', 'app', 'workflow');
  END IF;
END$$;

-- 2. Add the new columns if missing
ALTER TABLE "permission_role_node"
  ADD COLUMN IF NOT EXISTS "node_type" "PermissionNodeType" NOT NULL DEFAULT 'table';

-- 3. Rename table_id → node_id semantics (we keep the legacy column populated
--    so existing rows still resolve; new column mirrors it).
ALTER TABLE "permission_role_node"
  ADD COLUMN IF NOT EXISTS "node_id" TEXT;

UPDATE "permission_role_node"
   SET "node_id" = "table_id"
 WHERE "node_id" IS NULL;

ALTER TABLE "permission_role_node"
  ALTER COLUMN "node_id" SET NOT NULL;

-- 4. Index for the (roleId, nodeType) hot path used by the readiness probe
CREATE INDEX IF NOT EXISTS "permission_role_node_role_id_node_type_idx"
  ON "permission_role_node" ("role_id", "node_type");

-- 5. Replace the old (roleId, tableId) unique with (roleId, nodeType, nodeId).
--    The old index is dropped because it would conflict with multi-type uniqueness.
DROP INDEX IF EXISTS "permission_role_node_role_id_table_id_key";
ALTER TABLE "permission_role_node"
  DROP CONSTRAINT IF EXISTS "permission_role_node_role_id_table_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "permission_role_node_role_node_type_id_key"
  ON "permission_role_node" ("role_id", "node_type", "node_id");
