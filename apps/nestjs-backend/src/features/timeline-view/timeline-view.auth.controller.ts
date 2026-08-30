import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { TimelineViewAuthService } from './timeline-view.auth.service';

const TimelineViewGuard = LicenseCapabilityGuard.for('admin_panel');

const createViewSchema = z.object({
  tableId: z.string().min(1),
  name: z.string().min(1).max(200),
  startFieldId: z.string().optional(),
  endFieldId: z.string().optional(),
  groupByFieldId: z.string().optional(),
});

const addTaskSchema = z.object({
  tableId: z.string().min(1),
  viewId: z.string().min(1),
  title: z.string().min(1).max(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  parentTaskId: z.string().optional(),
});

const addDependencySchema = z.object({
  tableId: z.string().min(1),
  taskId: z.string().min(1),
  predecessorId: z.string().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
});

const progressSchema = z.object({
  progress: z.number().min(0).max(1),
});

@Controller('api/admin/view/timeline')
@UseGuards(TimelineViewGuard)
export class TimelineViewAuthController {
  constructor(private readonly service: TimelineViewAuthService) {}

  @Post('view')
  @Permissions('instance|update')
  createView(@Body(new ZodValidationPipe(createViewSchema)) body: z.infer<typeof createViewSchema>) {
    return this.service.createView(body as never);
  }

  @Get('view/:viewId/tasks')
  @Permissions('instance|read')
  tasks(@Param('viewId') viewId: string) {
    return this.service.listTasks(viewId);
  }

  @Get('view/:viewId/critical-path')
  @Permissions('instance|read')
  criticalPath(@Param('viewId') viewId: string) {
    return this.service.computeCriticalPathForView(viewId);
  }

  @Post('task')
  @Permissions('instance|update')
  addTask(@Body(new ZodValidationPipe(addTaskSchema)) body: z.infer<typeof addTaskSchema>) {
    return this.service.addTask(body as never);
  }

  @Delete('task/:taskId')
  @Permissions('instance|update')
  removeTask(@Param('taskId') taskId: string) {
    return this.service.removeTask(taskId);
  }

  @Post('task/:taskId/progress')
  @Permissions('instance|update')
  updateProgress(
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(progressSchema)) body: z.infer<typeof progressSchema>
  ) {
    return this.service.updateTaskProgress(taskId, body.progress);
  }

  @Post('dependency')
  @Permissions('instance|update')
  addDependency(@Body(new ZodValidationPipe(addDependencySchema)) body: z.infer<typeof addDependencySchema>) {
    return this.service.addDependency(body as never);
  }
}
