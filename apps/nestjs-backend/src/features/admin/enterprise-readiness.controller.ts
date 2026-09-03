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

  /**
   * Round-13: AI-agent skill manifest endpoint. Exposes this OSS instance
   * as a tool-callable skill for external AI agents. Mirrors Cloud's
   * teableio/agent-skills GitHub repo: discoverable manifest, installable
   * via `npx skills add https://github.com/teableio/agent-skills`.
   *
   * Public (no admin token) so AI agents can discover it without
   * credentials - they still need a Teable API token to actually mutate
   * data, which the skill installs during setup.
   */
  @Public()
  @Get('ai-skill')
  @HttpCode(200)
  async aiSkill(): Promise<{
    name: string;
    description: string;
    version: string;
    install: string;
    docs: string;
    capabilities: string[];
  }> {
    return {
      name: 'teable',
      description:
        'Query and update data, manage tables, and create automations or apps from your AI agent.',
      version: '1.0.0',
      install: 'npx skills add https://github.com/teableio/agent-skills',
      docs: 'https://help.teable.ai/en/basic/ai/teable-skill.md',
      capabilities: [
        'query_records',
        'create_records',
        'update_records',
        'delete_records',
        'list_tables',
        'list_bases',
        'create_table',
        'create_view',
        'trigger_automation',
        'install_app',
      ],
    };
  }

  /**
   * Round-13: Cloud-gap roadmap endpoint. Returns the cloudGap entries
   * sorted by ease-of-implementation, with framework presence + reason
   * classification. Operators use this to plan next-quarter OSS work.
   */
  @Public()
  @Get('cloud-gap-roadmap')
  @HttpCode(200)
  async cloudGapRoadmap(
    @Headers('x-admin-token') adminToken: string | undefined,
  ): Promise<{
    topFillable: ReturnType<EnterpriseReadinessService['topFillableGaps']>;
    total: number;
    byCategory: Record<string, number>;
    byReason: Record<string, number>;
  }> {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      throw new UnauthorizedException('admin token required');
    }
    const all = this.readiness.collectCloudGaps();
    const byCategory: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    for (const g of all) {
      byCategory[g.category] = (byCategory[g.category] ?? 0) + 1;
      byReason[g.reasonCategory ?? 'spec_only'] = (byReason[g.reasonCategory ?? 'spec_only'] ?? 0) + 1;
    }
    return {
      topFillable: this.readiness.topFillableGaps(5),
      total: all.length,
      byCategory,
      byReason,
    };
  }

  /**
   * Round-15: Migration source registry endpoint. Returns the list of
   * external systems the integration-connector framework recognizes as
   * migration sources, with their per-source implementation status.
   *
   * Auth: admin token (operators only). Use this to track which migration
   * drivers are still pending vs already wired.
   */
  @Public()
  @Get('migration-sources')
  @HttpCode(200)
  async migrationSources(
    @Headers('x-admin-token') adminToken: string | undefined,
  ): Promise<{
    total: number;
    implemented: number;
    pending: number;
    sources: Array<{ key: string; implemented: boolean; implementedBy: string }>;
  }> {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      throw new UnauthorizedException('admin token required');
    }
    const sources = this.readiness.migrationSourceRegistry();
    return {
      total: sources.length,
      implemented: sources.filter((s) => s.implemented).length,
      pending: sources.filter((s) => !s.implemented).length,
      sources,
    };
  }

  /**
   * Round-27: Operator dashboard summary endpoint.
   * Aggregates cloudGap / capability / driver health / AI skill / authority
   * matrix / parity + actionable recommendations into a single response
   * suitable for a frontend admin UI or curl-based ops check.
   *
   * Auth: admin token. Pure aggregator — does not mutate state.
   */
  @Public()
  @Get('dashboard')
  @HttpCode(200)
  async dashboard(
    @Headers('x-admin-token') adminToken: string | undefined,
  ): Promise<unknown> {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      throw new UnauthorizedException('admin token required');
    }
    return this.readiness.buildDashboardSummary();
  }

  /**
   * Round-28: Per-capability 3-state (oss / self_hosted / cloud)
   * evidence manifest. Closes Phase 6 §20.4: gives operators a single
   * endpoint that classifies every capability so a dashboard can
   * render the OSS / self-hosted / Cloud parity view directly.
   *
   * Auth: admin token (same gate as `/dashboard` and `/migration-sources`).
   */
  @Public()
  @Get('manifest')
  @HttpCode(200)
  async manifest(
    @Headers('x-admin-token') adminToken: string | undefined,
  ): Promise<unknown> {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      throw new UnauthorizedException('admin token required');
    }
    return this.readiness.buildManifest();
  }
}
