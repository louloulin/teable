import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SmartsheetImportService } from './smartsheet-import.service';

/**
 * Round-21: Smartsheet import controller. 3 endpoints under /api/smartsheet-import/.
 * Round-42: `/rows` keeps its original `rowCount` + `sample` shape but
 *   delegates to the new paginated `listRows` (single-page call only —
 *   the record-creation path uses the service directly).
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
    const effectivePageSize = pageSize ? Math.min(500, Number(pageSize)) : 100;
    // Single-page fetch for the lightweight preview endpoint — the
    // record-creation path is service-internal.
    const { rows } = await this.service.fetchRowsPage(
      token,
      sheetIdNum,
      effectivePageSize
    );
    return {
      sheetId: sheetIdNum,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }
}
