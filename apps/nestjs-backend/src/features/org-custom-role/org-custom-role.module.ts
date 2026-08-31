import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { OrgCustomRoleAuthService } from './org-custom-role.auth.service';
import { OrgCustomRoleController } from './org-custom-role.controller';

/**
 * Round-32: Org custom role NestJS module.
 *
 * Wires OrgCustomRoleAuthService (custom-role + role-assignment CRUD,
 * validation, scope filtering, role-applies-to-base) to the HTTP layer
 * via the new OrgCustomRoleController. The pure helpers in
 * org-custom-role.service.ts (validateRole, validateAssignment,
 * normalizeRole, normalizeAssignment, roleGrants, resolveInherited,
 * applicableScopes, etc.) are consumed exclusively by the auth service.
 *
 * Registers 7 endpoints worth of routes:
 *   - Role CRUD: PUT/GET/GET-LIST/DELETE on /roles/:id and /orgs/:orgId/roles
 *   - Assignment CRUD: PUT/GET-LIST/DELETE on /assignments/:id
 *     and /orgs/:orgId/users/:userId/assignments
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrgCustomRoleController],
  providers: [OrgCustomRoleAuthService],
  exports: [OrgCustomRoleAuthService],
})
export class OrgCustomRoleModule {}
