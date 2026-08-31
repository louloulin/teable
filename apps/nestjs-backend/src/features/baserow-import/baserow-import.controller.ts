import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { BaserowImportService } from './baserow-import.service';

/**
 * Round-16: Baserow import controller. Exposes 3 minimal endpoints for
 * operators/admins to verify the driver works against a live Baserow
 * instance. Token is provided per-request (not stored) so this is safe
 * to expose publicly in dev.
 */
@Controller('api/baserow-import')
export class BaserowImportController {
  constructor(private readonly service: BaserowImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { baseUrl: string; token: string; baseId: number }) {
    return this.service.probe(body.baseUrl, body.token, body.baseId);
  }

  @Public()
  @Get('rows')
  async rows(
    @Query('baseUrl') baseUrl: string,
    @Query('token') token: string,
    @Query('tableId') tableId: string,
    @Query('pageSize') pageSize?: string
  ) {
    const tableIdNum = Number(tableId);
    if (!Number.isFinite(tableIdNum)) {
      return { error: 'invalid tableId' };
    }
    return this.service.fetchRows(
      baseUrl,
      token,
      tableIdNum,
      pageSize ? Math.min(500, Number(pageSize)) : 100
    );
  }

  @Public()
  @Get('fields')
  async fields(
    @Query('baseUrl') baseUrl: string,
    @Query('token') token: string,
    @Query('tableId') tableId: string
  ) {
    const tableIdNum = Number(tableId);
    if (!Number.isFinite(tableIdNum)) {
      return { error: 'invalid tableId' };
    }
    return this.service.listFields(baseUrl, token, tableIdNum);
  }
}
