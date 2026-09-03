/**
 * AI Field admin HTTP controller (V26 — Cloud §field/ai/ai-field).
 *
 * Exposes the previously-orphaned AiFieldAuthService via HTTP so admins
 * can manage per-field AI configurations (summarize / translate /
 * classify) tied to a base + table + field.
 *
 * Route ordering matters in NestJS — specific paths (/templates/...) must
 * be declared BEFORE the parametric /:aiFieldId routes, otherwise
 * `:aiFieldId` will greedily match "templates".
 *
 * Endpoints (all under /api/admin/ai-field):
 *   POST   /                       create
 *   GET    /?baseId=&tableId=      list
 *   POST   /templates              create template
 *   GET    /templates              list templates (static segment first)
 *   DELETE /templates/:templateId  delete template
 *   GET    /:aiFieldId             get one
 *   PATCH  /:aiFieldId             update
 *   DELETE /:aiFieldId             delete
 *   POST   /:aiFieldId/runs        record a run (stub LLM)
 *   GET    /:aiFieldId/runs        list recent runs
 *   GET    /:aiFieldId/usage       usage aggregate
 *   POST   /:aiFieldId/batch       start batch generation (fill-empty | entire-column)
 *   GET    /:aiFieldId/batch/tasks list batch tasks for this AI field
 *   GET    /batch/tasks/:taskId    get batch task status
 *   POST   /batch/tasks/:taskId/cancel cancel batch task
 *
 * License: AGPL-3.0
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import type { ICreateAiFieldInput, IRunAiFieldInput, ICreateTemplateInput, BatchGenerationMode } from './ai-field.types';
import { AiFieldAuthService } from './ai-field.auth.service';

@Controller('api/admin/ai-field')
export class AiFieldController {
  constructor(
    private readonly svc: AiFieldAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private currentUserId(): string {
    const id = this.cls.get('user.id');
    if (!id) throw new UnauthorizedException('AI Field requires an authenticated user');
    return id;
  }

  // ─── collection (declared first so root isn't shadowed by id routes) ─
  @Post()
  async create(@Body() body: ICreateAiFieldInput) {
    return this.svc.createAiField({ ...body, createdBy: this.currentUserId() });
  }

  @Get()
  async list(@Query('baseId') baseId: string, @Query('tableId') tableId: string) {
    if (!baseId || !tableId) throw new BadRequestException('baseId + tableId required');
    return this.svc.listAiFields(baseId, tableId);
  }

  // ─── templates (static path BEFORE parametric :aiFieldId) ────────────
  @Post('templates')
  async createTemplate(@Body() body: ICreateTemplateInput) {
    return this.svc.createTemplate({ ...body, createdBy: this.currentUserId() });
  }

  @Get('templates')
  async listTemplates(
    @Query('operation') operation?: string,
    @Query('language') language?: string
  ) {
    const op = operation ?? 'summarize';
    return this.svc.listTemplates({
      operation: op as 'classify' | 'summarize' | 'translate',
      language: language ?? 'english',
    });
  }

  @Delete('templates/:templateId')
  async deleteTemplate(@Param('templateId') id: string) {
    await this.svc.deleteTemplate(id);
    return { ok: true, id };
  }

  // ─── Batch generation (static /batch/tasks/:taskId BEFORE parametric :aiFieldId) ─
  @Get('batch/tasks/:taskId')
  async getBatchTask(@Param('taskId') taskId: string) {
    const task = await this.svc.getBatchTask(taskId);
    if (!task) throw new BadRequestException('task not found');
    return task;
  }

  @Post('batch/tasks/:taskId/cancel')
  async cancelBatchTask(@Param('taskId') taskId: string) {
    return this.svc.cancelBatchTask(taskId);
  }

  // ─── per-id (parametric) ────────────────────────────────────────────
  @Get(':aiFieldId')
  async get(@Param('aiFieldId') id: string) {
    const out = await this.svc.getAiField(id);
    if (!out) throw new BadRequestException('not found');
    return out;
  }

  @Patch(':aiFieldId')
  async update(@Param('aiFieldId') id: string, @Body() body: Partial<ICreateAiFieldInput>) {
    return this.svc.updateAiField(id, body);
  }

  @Delete(':aiFieldId')
  async remove(@Param('aiFieldId') id: string) {
    await this.svc.deleteAiField(id);
    return { ok: true, id };
  }

  @Post(':aiFieldId/runs')
  async run(@Param('aiFieldId') aiFieldId: string, @Body() body: Omit<IRunAiFieldInput, 'aiFieldId'>) {
    const run = await this.svc.executeRun({
      aiFieldId,
      recordId: body.recordId,
      inputText: body.inputText,
      stubOutput: body.stubOutput,
      force: body.force,
      rowFields: body.rowFields,
    });
    return { ...run, note: run.status === 'ok' ? 'real provider execution' : undefined };
  }

  @Get(':aiFieldId/runs')
  async runs(@Param('aiFieldId') id: string, @Query('limit') limit?: string) {
    return this.svc.listRuns(id, limit ? Number(limit) : 50);
  }

  @Get(':aiFieldId/usage')
  async usage(@Param('aiFieldId') id: string) {
    return this.svc.foldUsageFor(id);
  }

  // ─── Batch generation (per AI field) ────────────────────────────────
  @Post(':aiFieldId/batch')
  async startBatch(
    @Param('aiFieldId') aiFieldId: string,
    @Body() body: { mode: BatchGenerationMode; viewId?: string }
  ) {
    if (!body.mode || !['fill-empty', 'entire-column'].includes(body.mode)) {
      throw new BadRequestException("mode must be 'fill-empty' or 'entire-column'");
    }
    return this.svc.startBatchGeneration({
      aiFieldId,
      mode: body.mode,
      viewId: body.viewId,
      createdBy: this.currentUserId(),
    });
  }

  @Get(':aiFieldId/batch/tasks')
  async listBatchTasks(@Param('aiFieldId') aiFieldId: string, @Query('limit') limit?: string) {
    return this.svc.listBatchTasks(aiFieldId, limit ? Number(limit) : 20);
  }
}
