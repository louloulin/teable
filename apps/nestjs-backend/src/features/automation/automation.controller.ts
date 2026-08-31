import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  UnauthorizedException,
  Query,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';

import { CustomHttpException } from '../../custom.exception';
import { Public } from '../auth/decorators/public.decorator';
import { AutomationActionCatalogAuthService } from '../automation-action-catalog/automation-action-catalog.auth.service';
import { AutomationTriggerCatalogAuthService } from '../automation-trigger-catalog/automation-trigger-catalog.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AutomationAiBuilderService } from './automation-ai-builder.service';
import { listScriptSamples } from './script-samples';
import { AutomationEventListener } from './automation-event.listener';
import { AutomationRateLimitService } from './automation-rate-limit.service';
import { AutomationService } from './automation.service';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  IAutomationCreateInput,
  IAutomationRunRow,
  IAutomationTriggerInput,
} from './automation.types';

/**
 * Capability guard re-used by every method on this controller. The
 * `automation` capability gates Business+ access; self-hosted OSS bypasses
 * the gate for local operation.
 */
const AutomationGuard = LicenseCapabilityGuard.for('automation');

/**
 * REST controller for automations.
 *
 *   POST   /api/automation                 create
 *   GET    /api/automation?baseId=X        list by base
 *   GET    /api/automation/:id             detail
 *   DELETE /api/automation/:id             delete
 *   POST   /api/automation/run             trigger (manual fire)
 *   GET    /api/automation/run/:id         run history detail
 */
@Controller('api/automation')
@UseGuards(AutomationGuard)
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly automationEvent: AutomationEventListener,
    private readonly rateLimit: AutomationRateLimitService,
    private readonly aiBuilder: AutomationAiBuilderService,
    @Optional() private readonly actionCatalog?: AutomationActionCatalogAuthService,
    @Optional() private readonly triggerCatalog?: AutomationTriggerCatalogAuthService
  ) {}

  @Get('catalog')
  getCatalog(): unknown {
    return {
      actions: this.actionCatalog?.getCatalog().types ?? [],
      actionVersion: this.actionCatalog?.getCatalog().version ?? 1,
      defaultAction: this.actionCatalog?.getCatalog().defaultType ?? 'update_record',
      triggers: this.triggerCatalog?.getCatalog().types ?? [],
      triggerVersion: this.triggerCatalog?.getCatalog().version ?? 1,
      defaultTrigger: this.triggerCatalog?.getCatalog().defaultType ?? 'record_created',
    };
  }

  /**
   * Round-24: Sample Script Library endpoint.
   * Returns 12 ready-to-use JS scripts covering transform / lookup / branch /
   * http / webhook patterns. Each sample includes bilingual (en + zh) name
   * and description for the `script_samples` + `ai_script_zh` cloudGap.
   */
  @Public()
  @Get('script-samples')
  getScriptSamples(
    @Query('category') category?: string,
    @Query('locale') locale?: string
  ): unknown {
    const loc: 'en' | 'zh' = locale === 'zh' ? 'zh' : 'en';
    const samples = listScriptSamples({ category, locale: loc });
    return {
      total: samples.length,
      locale: loc,
      category: category ?? null,
      samples,
    };
  }

  /**
   * Round-24: Single script sample by id (for the script editor's
   * "Insert sample" button).
   */
  @Public()
  @Get('script-samples/:id')
  getScriptSample(@Param('id') id: string, @Query('locale') locale?: string): unknown {
    const loc: 'en' | 'zh' = locale === 'zh' ? 'zh' : 'en';
    const samples = listScriptSamples({ locale: loc });
    const found = samples.find((s) => s.id === id);
    if (!found) return { error: 'sample not found', id };
    return found;
  }

  @Post('ai-draft')
  async generateAiDraft(
    @Req() request: Express.Request,
    @Body()
    body: {
      baseId?: string;
      prompt?: string;
      automationId?: string;
      modelKey?: string;
      offline?: boolean;
    }
  ): Promise<unknown> {
    const actorId = this.actorId(request);
    if (!body?.baseId || !body.prompt) {
      throw new BadRequestException('baseId and prompt are required');
    }
    const result = await this.aiBuilder.generate({
      baseId: body.baseId,
      prompt: body.prompt,
      automationId: body.automationId,
      modelKey: body.modelKey,
      offline: body.offline,
    });
    if (body.automationId) {
      const updated = await this.automation.update(body.automationId, {
        ...result.draft,
        lastModifiedBy: actorId,
        triggers: result.draft.triggers,
        actions: result.draft.actions,
      });
      return {
        source: result.source,
        model: result.model,
        automationId: updated.id,
        draft: result.draft,
      };
    }
    const created = await this.automation.createDraft(body.baseId, result.draft, actorId);
    return {
      source: result.source,
      model: result.model,
      automationId: created.id,
      draft: result.draft,
    };
  }

  @Post()
  async create(
    @Req() request: Express.Request,
    @Body() body: Partial<IAutomationCreateInput>
  ): Promise<unknown> {
    const actorId = this.actorId(request);
    if (!body?.baseId || !body.name) {
      throw new BadRequestException('baseId and name are required');
    }
    if (!Array.isArray(body.triggers) || body.triggers.length === 0) {
      throw new BadRequestException('at least one trigger is required');
    }
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      throw new BadRequestException('at least one action is required');
    }
    for (const t of body.triggers) {
      if (!AUTOMATION_TRIGGER_TYPES.includes(t.type)) {
        throw new BadRequestException(`invalid trigger type: ${t.type}`);
      }
    }
    for (const a of body.actions) {
      if (!AUTOMATION_ACTION_TYPES.includes(a.type)) {
        throw new BadRequestException(`invalid action type: ${a.type}`);
      }
    }
    const detail = await this.automation.create({
      ...body,
      createdBy: actorId,
    } as IAutomationCreateInput);
    return {
      id: detail.id,
      baseId: detail.baseId,
      name: detail.name,
      enabled: detail.enabled,
      triggers: detail.triggers.map((t) => ({
        id: t.id,
        type: t.type,
        tableId: t.tableId,
      })),
      actions: detail.actions.map((a) => ({
        id: a.id,
        type: a.type,
        orderIndex: a.orderIndex,
      })),
    };
  }

  @Get()
  async list(@Query('baseId') baseId: string): Promise<unknown> {
    if (!baseId) {
      throw new BadRequestException('baseId is required');
    }
    const rows = await this.automation.listByBase(baseId);
    return {
      automations: rows.map((r) => ({
        id: r.id,
        baseId: r.baseId,
        name: r.name,
        enabled: r.enabled,
        createdTime: r.createdTime,
      })),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<unknown> {
    const detail = await this.automation.get(id);
    if (!detail) {
      throw new NotFoundException(`automation ${id} not found`);
    }
    return {
      id: detail.id,
      baseId: detail.baseId,
      name: detail.name,
      description: detail.description,
      enabled: detail.enabled,
      draftVersion: detail.draftVersion ?? 0,
      liveVersion: detail.liveVersion ?? 1,
      hasDraft: Boolean(detail.draftConfig),
      draft: detail.draftConfig ? this.redactSensitive(detail.draftConfig) : null,
      triggers: detail.triggers.map((trigger) => ({
        ...trigger,
        config: this.redactTriggerConfig(trigger.config),
      })),
      actions: detail.actions.map((action) => ({
        ...action,
        config: this.redactSensitive(action.config),
      })),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const detail = await this.automation.get(id);
    if (!detail) {
      throw new NotFoundException(`automation ${id} not found`);
    }
    await this.automation.remove(id);
  }

  @Get(':id/secrets')
  async listSecrets(@Param('id') id: string): Promise<unknown> {
    const detail = await this.automation.get(id);
    if (!detail) throw new NotFoundException(`automation ${id} not found`);
    return { secrets: await this.automation.listSecretNames(id) };
  }

  @Put(':id/secrets/:name')
  async upsertSecret(
    @Req() request: Express.Request,
    @Param('id') id: string,
    @Param('name') name: string,
    @Body() body: { value?: string }
  ): Promise<{ name: string }> {
    const actorId = this.actorId(request);
    if (typeof body?.value !== 'string') {
      throw new BadRequestException('value is required');
    }
    const detail = await this.automation.get(id);
    if (!detail) throw new NotFoundException(`automation ${id} not found`);
    await this.automation.upsertSecret(id, name, body.value, actorId);
    return { name: name.toUpperCase() };
  }

  @Delete(':id/secrets/:name')
  @HttpCode(204)
  async deleteSecret(@Param('id') id: string, @Param('name') name: string): Promise<void> {
    const detail = await this.automation.get(id);
    if (!detail) throw new NotFoundException(`automation ${id} not found`);
    await this.automation.deleteSecret(id, name);
  }

  @Post('webhook/:id')
  @Public()
  async webhook(
    @Param('id') id: string,
    @Headers('x-teable-webhook-secret') secret: string | undefined,
    @Body() payload: Record<string, unknown>
  ) {
    const detail = await this.automation.get(id);
    if (!detail) {
      throw new NotFoundException(`automation ${id} not found`);
    }
    this.assertInboundSecret(detail.triggers, 'webhook_received', secret);
    this.assertPayloadSize(payload);
    if (!this.rateLimit.consume(detail.baseId, id, 'webhook')) {
      throw new CustomHttpException('Too Many Requests', HttpErrorCode.TOO_MANY_REQUESTS, {
        cause: 'AUTOMATION_WEBHOOK_RATE_LIMIT',
      });
    }
    await this.automationEvent.dispatchTrigger(id, 'webhook_received', payload);
    return { accepted: true };
  }

  @Post('email/:id')
  @Public()
  async emailReceived(
    @Param('id') id: string,
    @Headers('x-teable-webhook-secret') secret: string | undefined,
    @Body() payload: Record<string, unknown>
  ) {
    const detail = await this.automation.get(id);
    if (!detail) throw new NotFoundException(`automation ${id} not found`);
    this.assertInboundSecret(detail.triggers, 'email_received', secret);
    this.assertPayloadSize(payload);
    if (!this.rateLimit.consume(detail.baseId, id, 'email')) {
      throw new CustomHttpException('Too Many Requests', HttpErrorCode.TOO_MANY_REQUESTS, {
        cause: 'AUTOMATION_EMAIL_RATE_LIMIT',
      });
    }
    await this.automationEvent.dispatchTrigger(id, 'email_received', payload);
    return { accepted: true };
  }

  @Post('run')
  async run(
    @Body() body: { automationId: string; input: IAutomationTriggerInput }
  ): Promise<unknown> {
    if (!body?.automationId || !body.input?.triggerType) {
      throw new BadRequestException('automationId and input.triggerType are required');
    }
    if (!AUTOMATION_TRIGGER_TYPES.includes(body.input.triggerType)) {
      throw new BadRequestException(`invalid triggerType: ${body.input.triggerType}`);
    }
    if (body.input.triggerType === 'button_clicked') {
      const run = await this.automationEvent.runManual(body.automationId, body.input.payload);
      return { runId: run.id, status: run.status };
    }
    const run = await this.automation.trigger(body.automationId, body.input);
    return { runId: run.id, status: run.status };
  }

  @Get(':id/runs')
  async listRuns(@Param('id') id: string, @Query('take') take?: string): Promise<unknown> {
    const detail = await this.automation.get(id);
    if (!detail) throw new NotFoundException(`automation ${id} not found`);
    const runs = await this.automation.listRuns(id, take ? Number(take) : 50);
    return { runs: runs.map((run) => this.redactRun(run)) };
  }

  @Get('run/:runId/diagnose')
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async diagnose(@Param('runId') runId: string): Promise<unknown> {
    const run = await this.automation.getRun(runId);
    if (!run) throw new NotFoundException(`run ${runId} not found`);
    const output = run.output && typeof run.output === 'object' ? run.output : {};
    const steps = Array.isArray(output.steps) ? output.steps : [];
    const failedStep = steps.find(this.isFailedStep);
    const detail = await this.automation.get(run.automationId);
    const canResume =
      run.status === 'failed' &&
      Boolean(detail?.enabled) &&
      (run.version ?? 1) === (detail?.liveVersion ?? 1) &&
      typeof failedStep?.index === 'number' &&
      failedStep.index > 0;
    return {
      runId,
      status: run.status,
      error: run.error,
      failedStep: failedStep ?? null,
      canResume,
      recommendation: canResume ? 'resume' : 'full_rerun',
      reason: canResume
        ? null
        : run.status !== 'failed'
          ? 'run is not failed'
          : !detail?.enabled
            ? 'automation is disabled or unavailable'
            : (run.version ?? 1) !== (detail?.liveVersion ?? 1)
              ? 'automation changed after the run'
              : 'no completed step precedes the failure',
    };
  }

  @Post('run/:runId/rerun')
  async rerun(
    @Param('runId') runId: string,
    @Body() body: { mode?: 'full' | 'resume' }
  ): Promise<{ accepted: boolean; mode: string }> {
    const mode = body?.mode ?? 'full';
    if (mode !== 'full' && mode !== 'resume') {
      throw new BadRequestException('mode must be full or resume');
    }
    await this.automationEvent.rerunRun(runId, mode);
    return { accepted: true, mode };
  }

  @Patch(':id')
  async update(
    @Req() request: Express.Request,
    @Param('id') id: string,
    @Body() body: Partial<IAutomationCreateInput>
  ): Promise<unknown> {
    const actorId = this.actorId(request);
    if (!Array.isArray(body.triggers) || !Array.isArray(body.actions)) {
      throw new BadRequestException('triggers and actions are required');
    }
    for (const trigger of body.triggers) {
      if (!AUTOMATION_TRIGGER_TYPES.includes(trigger.type)) {
        throw new BadRequestException(`invalid trigger type: ${trigger.type}`);
      }
    }
    for (const action of body.actions) {
      if (!AUTOMATION_ACTION_TYPES.includes(action.type)) {
        throw new BadRequestException(`invalid action type: ${action.type}`);
      }
    }
    const detail = await this.automation.update(id, {
      name: body.name,
      description: body.description ?? null,
      enabled: body.enabled,
      lastModifiedBy: actorId,
      triggers: body.triggers,
      actions: body.actions,
    });
    return {
      id: detail.id,
      name: detail.name,
      enabled: detail.enabled,
      draftVersion: detail.draftVersion ?? 0,
      liveVersion: detail.liveVersion ?? 1,
      hasDraft: Boolean(detail.draftConfig),
      triggers: detail.triggers,
      actions: detail.actions,
    };
  }

  @Post(':id/apply-update')
  async applyUpdate(
    @Req() request: Express.Request,
    @Param('id') id: string,
    @Body() _body: Record<string, unknown>
  ): Promise<unknown> {
    const detail = await this.automation.applyUpdate(id, this.actorId(request));
    return {
      id: detail.id,
      name: detail.name,
      enabled: detail.enabled,
      draftVersion: detail.draftVersion ?? 0,
      liveVersion: detail.liveVersion ?? 1,
      hasDraft: Boolean(detail.draftConfig),
      triggers: detail.triggers,
      actions: detail.actions,
    };
  }

  @Get('run/:runId')
  async getRun(@Param('runId') runId: string): Promise<unknown> {
    const run = await this.automation.getRun(runId);
    if (!run) {
      throw new NotFoundException(`run ${runId} not found`);
    }
    return {
      id: run.id,
      automationId: run.automationId,
      triggerType: run.triggerType,
      status: run.status,
      input: this.redactSensitive(run.input),
      output: this.redactSensitive(run.output),
      error: run.error,
      retryCount: run.retryCount,
      parentRunId: run.parentRunId,
      version: run.version,
      resumeFromStep: run.resumeFromStep,
      startedAt: this.serializeDate(run.startedAt),
      finishedAt: this.serializeDate(run.finishedAt),
      createdTime: this.serializeDate(run.createdTime),
    };
  }

  private actorId(request: Express.Request): string {
    const actorId = (request.user as { id?: unknown } | undefined)?.id;
    if (typeof actorId !== 'string' || !actorId) {
      throw new UnauthorizedException('authenticated user is required');
    }
    return actorId;
  }

  private assertPayloadSize(payload: Record<string, unknown>): void {
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (size > 4 * 1024 * 1024) {
      throw new PayloadTooLargeException('automation payload exceeds 4 MB');
    }
  }

  private assertInboundSecret(
    triggers: Array<{ type: string; config: Record<string, unknown> }>,
    triggerType: 'webhook_received' | 'email_received',
    suppliedSecret?: string
  ): void {
    const configured = triggers.find((trigger) => trigger.type === triggerType)?.config?.secret;
    if (typeof configured !== 'string' || configured.length === 0) {
      throw new UnauthorizedException('automation inbound secret is not configured');
    }
    if (suppliedSecret !== configured) {
      throw new UnauthorizedException('invalid automation webhook secret');
    }
  }

  private redactTriggerConfig(config: Record<string, unknown>): Record<string, unknown> {
    return this.redactSensitive(config);
  }

  private redactRun(run: IAutomationRunRow): Record<string, unknown> {
    return this.redactSensitive(run);
  }

  private redactSensitive(value: unknown): Record<string, unknown> {
    if (value instanceof Date) {
      return value.toISOString() as unknown as Record<string, unknown>;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const normalized = key.toLowerCase();
        if (
          normalized.includes('secret') ||
          normalized.includes('token') ||
          normalized.includes('password') ||
          normalized === 'authorization' ||
          normalized.includes('apikey')
        ) {
          return [key, '••••••••'];
        }
        return [key, this.redactNested(nested)];
      })
    );
  }

  private redactNested(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.redactNested(item));
    if (value && typeof value === 'object') return this.redactSensitive(value);
    return value;
  }

  private serializeDate(value: Date | null): string | null {
    return value instanceof Date ? value.toISOString() : value;
  }

  private isFailedStep(step: unknown): step is Record<string, unknown> {
    return Boolean(
      step && typeof step === 'object' && (step as Record<string, unknown>).status === 'failed'
    );
  }
}
