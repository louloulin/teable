import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SmartsheetImportService } from './smartsheet-import.service';

/**
 * Round-21: Smartsheet import controller. 3 endpoints under /api/smartsheet-import/.
 * Token provided per-request (not stored).
 */
@Controller('api/smartsheet-import')
export class SmartsheetImportController {
  constructor(private readonly service: SmartsheetImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { token: string }) {
    return this.service.probe(body.token);
  }

  @Public()
  @Get('sheets')
  async sheets(@Query('token') token: string, @Query('pageSize') pageSize?: string) {
    return this.service.listSheets(
      token,
      pageSize ? Math.min(500, Number(pageSize)) : 100
    );
  }

  @Public()
  @Get('rows')
  async rows(
    @Query('token') token: string,
    @Query('sheetId') sheetId: string,
    @Query('pageSize') pageSize?: string
  ) {
    const sheetIdNum = Number(sheetId);
    if (!Number.isFinite(sheetIdNum)) {
      return { error: 'invalid sheetId' };
    }
    return this.service.fetchRows(
      token,
      sheetIdNum,
      pageSize ? Math.min(500, Number(pageSize)) : 100
    );
  }
}
