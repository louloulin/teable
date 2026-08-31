import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SmartSuiteImportService } from './smartsuite-import.service';

/**
 * Round-22: SmartSuite import controller. 4 endpoints under /api/smartsuite-import/.
 * Token provided per-request (not stored).
 */
@Controller('api/smartsuite-import')
export class SmartSuiteImportController {
  constructor(private readonly service: SmartSuiteImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { token: string }) {
    return this.service.probe(body.token);
  }

  @Public()
  @Get('apps')
  async apps(@Query('token') token: string) {
    return this.service.listApps(token);
  }

  @Public()
  @Get('tables')
  async tables(@Query('token') token: string, @Query('appId') appId: string) {
    if (!appId) {
      return { error: 'invalid appId' };
    }
    return this.service.listTables(token, appId);
  }

  @Public()
  @Get('records')
  async records(
    @Query('token') token: string,
    @Query('appId') appId: string,
    @Query('limit') limit?: string
  ) {
    if (!appId) {
      return { error: 'invalid appId' };
    }
    const lim = limit ? Math.min(500, Number(limit)) : 100;
    return this.service.fetchRecords(token, appId, Number.isFinite(lim) ? lim : 100);
  }
}
