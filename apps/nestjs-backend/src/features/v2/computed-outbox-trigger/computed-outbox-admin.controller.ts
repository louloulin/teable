import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../zod.validation.pipe';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../../license/license-capability.guard';
import { ComputedOutboxAnomalyService } from './computed-outbox-anomaly.service';
import { ComputedOutboxMonitorService } from './computed-outbox-monitor.service';

const ComputedOutboxGuard = LicenseCapabilityGuard.for('computed_outbox');
const anomalyQuerySchema = z.object({
  groupLimit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
const recoverSchema = z.object({
  targetId: z.string().min(1).max(300),
  taskId: z.string().min(1).max(200),
  kind: z.enum(['dead', 'stale']),
});

@Controller('api/admin/computed-outbox')
@UseGuards(ComputedOutboxGuard)
@Permissions('instance|read')
export class ComputedOutboxAdminController {
  constructor(
    private readonly monitor: ComputedOutboxMonitorService,
    private readonly anomaly: ComputedOutboxAnomalyService
  ) {}

  @Get('overview')
  async overview(@Query('force') force?: string) {
    return this.monitor.getOverview({ force: force !== 'false' });
  }

  @Get('anomalies')
  async anomalies(
    @Query(new ZodValidationPipe(anomalyQuerySchema)) query: z.infer<typeof anomalyQuerySchema>
  ) {
    return this.anomaly.list(query.groupLimit);
  }

  @Post('anomalies/recover')
  @Permissions('instance|update')
  async recover(@Body(new ZodValidationPipe(recoverSchema)) body: z.infer<typeof recoverSchema>) {
    return this.anomaly.recover(body);
  }
}
