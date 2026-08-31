import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { NocoDbImportService } from './nocodb-import.service';

/**
 * Round-20: NocoDB import controller. 4 endpoints under /api/nocodb-import/.
 * baseUrl + token provided per-request (not stored).
 */
@Controller('api/nocodb-import')
export class NocoDbImportController {
  constructor(private readonly service: NocoDbImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { baseUrl: string; token: string }) {
    return this.service.probe(body.baseUrl, body.token);
  }

  @Public()
  @Get('bases')
  async bases(@Query('baseUrl') baseUrl: string, @Query('token') token: string) {
    return this.service.listBases(baseUrl, token);
  }

  @Public()
  @Get('tables')
  async tables(
    @Query('baseUrl') baseUrl: string,
    @Query('token') token: string,
    @Query('baseId') baseId: string
  ) {
    return this.service.listTables(baseUrl, token, baseId);
  }

  @Public()
  @Get('rows')
  async rows(
    @Query('baseUrl') baseUrl: string,
    @Query('token') token: string,
    @Query('tableId') tableId: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.service.fetchRows(
      baseUrl,
      token,
      tableId,
      pageSize ? Math.min(500, Number(pageSize)) : 100
    );
  }
}
