import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { CrossBaseFederationAuthService } from './cross-base-federation.auth.service';
import { CrossBaseFederationController } from './cross-base-federation.controller';

/**
 * Round-30: Cross-base federation NestJS module.
 *
 * Wires the existing CrossBaseFederationAuthService (federation view +
 * source CRUD, event recording, refresh orchestration) to the HTTP
 * layer via the new CrossBaseFederationController. The pure helpers
 * in cross-base-federation.service.ts (validateView, validateSource,
 * startRefresh, consumeEvents, finishRefresh, shouldRefreshNow,
 * aliasMap) are consumed exclusively by the auth service.
 *
 * Registers 9 endpoints worth of routes:
 *   - View CRUD: PUT/GET/GET views + GET orgs/:orgId/views
 *   - Source CRUD: PUT/GET views/:viewId/sources/:id + list
 *   - Event flow: POST/GET views/:viewId/events
 *   - Refresh orchestration: POST views/:viewId/refresh + PUT refreshes/:id
 */
@Module({
  imports: [PrismaModule],
  controllers: [CrossBaseFederationController],
  providers: [CrossBaseFederationAuthService],
  exports: [CrossBaseFederationAuthService],
})
export class CrossBaseFederationModule {}
