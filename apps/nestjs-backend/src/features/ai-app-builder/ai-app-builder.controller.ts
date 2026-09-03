import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AiAppBuilderAuthService } from './ai-app-builder.auth.service';
import { AiAppBuilderService } from './ai-app-builder.service';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';

const AiAppBuilderGuard = LicenseCapabilityGuard.for('ai_app_builder');

@Controller('api/:baseId/apps')
@UseGuards(AiAppBuilderGuard)
export class AiAppBuilderController {
  constructor(
    private readonly svc: AiAppBuilderService,
    private readonly auth: AiAppBuilderAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private currentUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new UnauthorizedException('AI App Builder requires an authenticated user');
    return userId;
  }

  // ─── app instance CRUD (5 endpoints) ────────────────────────────────────

  @Post()
  @Permissions('base|update')
  async createApp(
    @Param('baseId') baseId: string,
    @Body() body: { name: string; description?: string }
  ) {
    const app = await this.svc.createApp(baseId, body.name, body.description, this.currentUserId());
    return app;
  }

  @Get()
  @Permissions('base|read')
  async listApps(@Param('baseId') baseId: string) {
    return this.svc.listApps(baseId);
  }

  @Get(':appId')
  @Permissions('base|read')
  async getApp(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    return this.auth.assertAppInBase(appId, baseId);
  }

  @Patch(':appId')
  @Permissions('base|update')
  async patchApp(
    @Param('baseId') baseId: string,
    @Param('appId') appId: string,
    @Body() body: { name?: string; description?: string }
  ) {
    await this.auth.assertAppInBase(appId, baseId);
    return this.svc.patchApp(appId, body.name, body.description);
  }

  @Delete(':appId')
  @Permissions('base|delete')
  async deleteApp(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.deleteApp(appId);
    return { ok: true, deleted: out.id };
  }

  // ─── versions / deploy / rollback (3 endpoints) ──────────────────────────

  @Post(':appId/deploy')
  @Permissions('base|update')
  async deploy(
    @Param('baseId') baseId: string,
    @Param('appId') appId: string,
    @Body() body: { sourcePrompt?: string; snapshot?: unknown }
  ) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.deploy(
      appId,
      this.currentUserId(),
      body?.sourcePrompt,
      body?.snapshot
    );
    return {
      appId,
      currentVersionId: out.app?.currentVersionId ?? out.version.id,
      version: out.version,
    };
  }

  @Post(':appId/rollback')
  @Permissions('base|update')
  async rollback(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.rollback(appId, this.currentUserId());
    if (!out.app) {
      throw new Error('app not found after rollback');
    }
    return { appId: appId, currentVersionId: out.app.currentVersionId, version: out.previous };
  }

  @Get(':appId/versions')
  @Permissions('base|read')
  async listVersions(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    return this.svc.listVersions(appId);
  }

  // ─── secrets (2 endpoints) ───────────────────────────────────────────────

  @Put(':appId/secrets')
  @Permissions('base|update')
  async putSecret(
    @Param('baseId') baseId: string,
    @Param('appId') appId: string,
    @Body() body: { secrets: Array<{ key: string; value: string; description?: string }> }
  ) {
    await this.auth.assertAppInBase(appId, baseId);
    const items = body?.secrets ?? [];
    const out = [];
    for (const s of items) {
      const row = await this.svc.putSecret(appId, s.key, s.value, s.description);
      out.push({ id: row.id, appId: row.appId, key: row.key, description: row.description, updatedAt: row.updatedAt });
    }
    // Return only key + meta — never the value (Cloud: write-only after save).
    return { count: out.length, items: out };
  }

  @Get(':appId/secrets')
  @Permissions('base|read')
  async listSecrets(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    return this.svc.listSecrets(appId);
  }

  // ─── files (2 endpoints; list + write) ───────────────────────────────────

  @Put(':appId/files')
  @Permissions('base|update')
  async putFile(
    @Param('baseId') baseId: string,
    @Param('appId') appId: string,
    @Body() body: { path: string; content: string }
  ) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.putFile(appId, body.path, body.content);
    return { id: out.id, appId: out.appId, path: out.path, sizeBytes: out.sizeBytes, updatedAt: out.updatedAt };
  }

  @Get(':appId/files')
  @Permissions('base|read')
  async listFiles(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    return this.svc.listFiles(appId);
  }

  // ─── publish + public URL (Round 45) ──────────────────────────────────────

  /**
   * Round 45: publish an app so it can be reached at `/a/<slug>`.
   * Requires a deployed current version. Idempotent.
   */
  @Post(':appId/publish')
  @Permissions('base|update')
  async publish(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.publish(appId);
    return { appId, ...out };
  }

  /**
   * Round 45: unpublish an app. Keeps the deployed version but clears
   * `public_slug` + `published_at` so the runtime endpoint 404s.
   * Idempotent.
   */
  @Post(':appId/unpublish')
  @Permissions('base|update')
  async unpublish(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    const out = await this.svc.unpublish(appId);
    return { appId, ...out };
  }

  /**
   * Round 45: return the public URL config. The runtime endpoint is
   * out of scope for this round; this route feeds the UI that shows
   * the live URL after publish.
   */
  @Get(':appId/public-url')
  @Permissions('base|read')
  async publicUrl(@Param('baseId') baseId: string, @Param('appId') appId: string) {
    await this.auth.assertAppInBase(appId, baseId);
    return this.svc.getPublicUrl(appId);
  }
}
