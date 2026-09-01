-- PermissionRoleNode now keys on (roleId, nodeType, nodeId); the legacy
-- table_id column is kept only for backward compatibility with rows created
-- before the node-type extension. It must be nullable so app/workflow rows
-- (which have no table_id) can be inserted by the Prisma client.
ALTER TABLE "permission_role_node"
  ALTER COLUMN "table_id" DROP NOT NULL;
