import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { GridProViewAuthService } from './grid-pro-view.auth.service';

const GridProViewGuard = LicenseCapabilityGuard.for('admin_panel');

const renderSchema = z.object({
  viewId: z.string().min(1),
  meta: z.object({
    columns: z.array(z.object({ id: z.string(), width: z.number().int().min(20).max(2000) })).max(200),
    rowHeight: z.number().int().min(16).max(128),
    windowSize: z.number().int().min(10).max(2000),
  }),
  rows: z.array(z.string().min(1)).max(100000),
});

@Controller('api/admin/view/grid-pro')
@UseGuards(GridProViewGuard)
export class GridProViewAuthController {
  constructor(private readonly service: GridProViewAuthService) {}

  @Post('render')
  @Permissions('instance|update')
  render(@Body(new ZodValidationPipe(renderSchema)) body: z.infer<typeof renderSchema>) {
    const spec = this.service.build(body as never);
    const cells = body.rows.map((rowId, idx) => ({
      rowId,
      values: {},
      rowIndex: idx,
    }));
    return this.service.render(spec as never, cells as never);
  }

  @Post('ping')
  @Permissions('instance|read')
  async ping() {
    return { ok: await this.service.ping() };
  }
}
