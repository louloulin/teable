/**
 * Unified source-import controller — exposes the durable task
 * pipeline to admins.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { SourceImportCancellationService } from './source-import-cancellation.service';
import { SourceImportService } from './source-import.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface IStartBody {
  source: string;
  spaceId: string;
  /** Optional target Teable base id (e.g. when adding Airtable tables into
   *  an existing base instead of creating one). */
  baseId?: string;
  /** Optional target Teable table id. Some sources (Notion) require it;
   *  others (Airtable) ignore it and create new tables. */
  tableId?: string;
  remoteId: string;
  triggeredBy?: string;
  idempotencyKey?: string;
  tenantId?: string;
  correlationId?: string;
  maxAttempts?: number;
  /** Free-form source-specific payload. The Airtable driver reads
   *  `accessToken` / `integrationId` / `shareLink` / `baseName` here;
   *  other drivers ignore unknown keys. */
  payload?: Record<string, unknown>;
}

@Controller('api/admin/source-imports')
export class SourceImportController {
  constructor(
    private readonly imports: SourceImportService,
    private readonly cancellation: SourceImportCancellationService
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  @Permissions('instance|update')
  async start(@Body() body: IStartBody) {
    if (!body?.source || !body.spaceId || !body.remoteId) {
      throw new BadRequestException('source, spaceId, and remoteId are required');
    }
    const task = await this.imports.enqueue({
      source: body.source,
      spaceId: body.spaceId,
      baseId: body.baseId,
      tableId: body.tableId,
      remoteId: body.remoteId,
      triggeredBy: body.triggeredBy,
      idempotencyKey: body.idempotencyKey,
      tenantId: body.tenantId,
      correlationId: body.correlationId,
      maxAttempts: body.maxAttempts,
      payload: body.payload,
    });
    return { taskId: task.id, status: task.status };
  }

  @Get(':taskId')
  @UseGuards(AdminGuard)
  @Permissions('instance|read')
  async get(@Param('taskId') taskId: string) {
    return this.imports.getTask(taskId);
  }

  @Post(':taskId/cancel')
  @UseGuards(AdminGuard)
  @Permissions('instance|update')
  async cancel(@Param('taskId') taskId: string | undefined) {
    const taskIdValue = taskId ?? '';
    if (!taskId) {
      throw new BadRequestException('taskId is required');
    }
    const task = await this.imports.cancelTask(taskIdValue);
    this.cancellation.requestCancel(taskIdValue);
    return task;
  }

  @Get()
  @UseGuards(AdminGuard)
  @Permissions('instance|read')
  async list(@Query('source') source?: string) {
    return this.imports.listTasks({ source, take: 20 });
  }
}
