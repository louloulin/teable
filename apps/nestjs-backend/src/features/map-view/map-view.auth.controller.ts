import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { MapViewAuthService } from './map-view.auth.service';

const MapViewGuard = LicenseCapabilityGuard.for('admin_panel');

const configSchema = z.object({
  tableId: z.string().min(1),
  config: z.string().min(1),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
  zoom: z.number().optional(),
});

@Controller('api/admin/view/map')
@UseGuards(MapViewGuard)
export class MapViewAuthController {
  constructor(private readonly service: MapViewAuthService) {}

  @Get(':tableId')
  @Permissions('instance|read')
  get(@Param('tableId') tableId: string) {
    return this.service.getConfig(tableId);
  }

  @Put()
  @Permissions('instance|update')
  save(@Body(new ZodValidationPipe(configSchema)) body: z.infer<typeof configSchema>) {
    return this.service.saveConfig(body as never);
  }

  @Get(':tableId/markers')
  @Permissions('instance|read')
  markers(@Param('tableId') tableId: string, @Query('limit') limit?: string) {
    return this.service.loadMarkers({
      tableId,
      limit: limit ? parseInt(limit, 10) : 500,
    } as never);
  }

  @Get(':tableId/rows')
  @Permissions('instance|read')
  rows(@Param('tableId') tableId: string, @Query('limit') limit?: string) {
    return this.service.loadRowsForTable(tableId, limit ? parseInt(limit, 10) : 500);
  }
}
