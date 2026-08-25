import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AutomationService } from './automation.service';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  IAutomationCreateInput,
  IAutomationTriggerInput,
} from './automation.types';

/**
 * Capability guard re-used by every method on this controller. The
 * `automation` capability gates Business+ access; self-hosted OSS without
 * a license gets `402 LICENSE_REQUIRED` before the handler runs.
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
  constructor(private readonly automation: AutomationService) {}

  @Post()
  async create(@Body() body: Partial<IAutomationCreateInput>): Promise<unknown> {
    if (!body?.baseId || !body.name || !body.createdBy) {
      throw new BadRequestException('baseId, name, createdBy are required');
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
    const detail = await this.automation.create(body as IAutomationCreateInput);
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
      triggers: detail.triggers,
      actions: detail.actions,
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const detail = await this.automation.get(id);
    if (!detail) {
      throw new NotFoundException(`automation ${id} not found`);
    }
    // Hard delete is intentional at MVP stage; soft-delete comes later
    // once we have run-history retention interplay.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = (this.automation as any).prisma;
    await prisma.automation.delete({ where: { id } });
  }

  @Post('run')
  async run(@Body() body: { automationId: string; input: IAutomationTriggerInput }): Promise<unknown> {
    if (!body?.automationId || !body.input?.triggerType) {
      throw new BadRequestException('automationId and input.triggerType are required');
    }
    if (!AUTOMATION_TRIGGER_TYPES.includes(body.input.triggerType)) {
      throw new BadRequestException(`invalid triggerType: ${body.input.triggerType}`);
    }
    const run = await this.automation.trigger(body.automationId, body.input);
    return { runId: run.id, status: run.status };
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
      input: run.input,
      output: run.output,
      error: run.error,
      retryCount: run.retryCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdTime: run.createdTime,
    };
  }
}
