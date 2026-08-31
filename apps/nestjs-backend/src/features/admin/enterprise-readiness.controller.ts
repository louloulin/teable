import { Controller, Get, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { EnterpriseReadinessService, type EnterpriseReadinessReport } from './enterprise-readiness.service';

/**
 * Single GET endpoint that surfaces the runtime state of every enterprise
 * capability the OSS instance ships with. Used by:
 *   - operator dashboards that want to verify which Business-plan features
 *     are actually wired up
 *   - automated verification scripts (scripts/e2e-enterprise-readiness.sh)
 *   - external monitoring agents that scrape capability counts
 *
 * Auth: requires `TEABLE_ADMIN_TOKEN` via the `x-admin-token` header.
 * The `@Public()` decorator lets the request through the global session
 * guard; our manual check rejects anything without the matching admin
 * token. The token is the same one used by `/api/quota/:spaceId` PUT and
 * matches the convention that "anything under /api/admin/* is operator-only".
 */
@Controller('api/admin/enterprise-readiness')
export class EnterpriseReadinessController {
  constructor(private readonly readiness: EnterpriseReadinessService) {}

  @Public()
  @Get()
  @HttpCode(200)
  async get(
    @Headers('x-admin-token') adminToken: string | undefined
  ): Promise<EnterpriseReadinessReport> {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      throw new UnauthorizedException('admin token required');
    }
    return this.readiness.report();
  }
}
