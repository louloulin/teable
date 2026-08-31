import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MondayImportService } from './monday-import.service';

/**
 * Round-19: Monday.com import controller. 4 endpoints under /api/monday-import/.
 * Token is provided per-request (not stored).
 */
@Controller('api/monday-import')
export class MondayImportController {
  constructor(private readonly service: MondayImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { token: string }) {
    return this.service.probe(body.token);
  }

  @Public()
  @Get('workspaces')
  async workspaces(@Query('token') token: string) {
    return this.service.listWorkspaces(token);
  }

  @Public()
  @Get('boards')
  async boards(@Query('token') token: string, @Query('limit') limit?: string) {
    return this.service.listBoards(
      token,
      limit ? Math.min(200, Number(limit)) : 25
    );
  }

  @Public()
  @Get('items')
  async items(
    @Query('token') token: string,
    @Query('boardId') boardId: string,
    @Query('limit') limit?: string
  ) {
    return this.service.fetchItems(
      token,
      boardId,
      limit ? Math.min(500, Number(limit)) : 100
    );
  }
}
