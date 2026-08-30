import { randomUUID } from 'crypto';
import { BadRequestException, Body, Controller, Get, Logger, Post } from '@nestjs/common';

import { PrismaService } from '@teable/db-main-prisma';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityService } from './license-capability.service';
import { LicenseService } from './license.service';

const LICENSE_SETTING_KEY = 'self_hosted_license';

interface ILicenseSetting {
  instanceId: string;
  licenseKey: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  plan: string | null;
  source: 'env' | 'runtime' | 'none';
}

/**
 * Self-hosted license activation controller (OSS gap-fill).
 *
 *   GET  /api/license/instance-id      Returns the persistent instance id.
 *   GET  /api/license/state            Returns instance id + current license state.
 *   POST /api/license/activate         Accepts {licenseKey:"plan:pro"} and
 *                                      pushes the resolution through
 *                                      LicenseService so QuotaService.setPlanLimits
 *                                      runs.
 *   POST /api/license/deactivate       Clears the active runtime license.
 *
 * Persistence: stored in `meta.setting` via the existing `Setting` model.
 * No new migration required.
 */
@Controller('api/license')
@Permissions('instance|read')
export class LicenseActivationController {
  private readonly logger = new Logger(LicenseActivationController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly license: LicenseService,
    private readonly caps: LicenseCapabilityService
  ) {}

  @Get('instance-id')
  async instanceId() {
    const state = await this.readState();
    return {
      instanceId: state.instanceId,
      plan: state.plan,
      activated: Boolean(state.licenseKey),
      expiresAt: state.expiresAt,
      source: state.source,
    };
  }

  @Get('state')
  async state() {
    return this.readState();
  }

  @Permissions('instance|update')
  @Post('activate')
  async activate(@Body() body: { licenseKey?: string }) {
    const key = body?.licenseKey;
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('licenseKey is required');
    }
    const resolved = this.license.resolve(key);
    if (resolved.source === 'none') {
      throw new BadRequestException('license key did not parse as plan: or JWT');
    }
    const plan = (resolved.claims?.plan ?? null) as string | null;
    const expiresAt =
      typeof resolved.claims?.expiresAt === 'number' && resolved.claims.expiresAt > 0
        ? new Date(resolved.claims.expiresAt).toISOString()
        : null;
    const current = await this.readState();
    await this.writeState({
      instanceId: current.instanceId,
      licenseKey: key,
      plan,
      expiresAt,
      source: 'runtime',
      activatedAt: new Date().toISOString(),
    });

    const applied = await this.license.applyToAllSpaces(resolved);
    this.license.setRuntimeLicense(resolved);
    this.caps.refresh(resolved);
    return { ok: true, plan, applied, expiresAt };
  }

  @Permissions('instance|update')
  @Post('deactivate')
  async deactivate() {
    const state = await this.readState();
    const current = await this.readState();
    await this.writeState({
      instanceId: current.instanceId,
      licenseKey: null,
      plan: 'self_hosted' as string,
      expiresAt: null,
      source: 'none',
      activatedAt: null,
    });
    this.license.setRuntimeLicense(null);
    this.caps.refresh();
    return { ok: true, previousPlan: state.plan };
  }

  // ── helpers ───────────────────────────────────────────────────────

  private async readState(): Promise<ILicenseSetting> {
    let stored: Partial<ILicenseSetting> = {};
    let found = false;
    try {
      const row = await this.prisma.setting.findFirst({
        where: { name: LICENSE_SETTING_KEY },
      });
      if (row?.content) {
        found = true;
        stored = JSON.parse(row.content) as Partial<ILicenseSetting>;
      }
    } catch (err) {
      this.logger.warn(`license.readState failed; defaulting: ${(err as Error)?.message ?? err}`);
    }
    const state = {
      instanceId: stored.instanceId ?? randomUUID(),
      licenseKey: stored.licenseKey ?? null,
      plan: stored.plan ?? ('self_hosted' as string),
      expiresAt: stored.expiresAt ?? null,
      source: stored.source ?? 'none',
      activatedAt: stored.activatedAt ?? null,
    };
    if (!found) await this.writeState(state);
    return state;
  }

  private async writeState(state: ILicenseSetting): Promise<void> {
    const payload = JSON.stringify(state);
    await this.prisma.setting.upsert({
      where: { name: LICENSE_SETTING_KEY },
      create: {
        name: LICENSE_SETTING_KEY,
        content: payload,
        createdBy: 'system',
      },
      update: { content: payload },
    });
  }
}
