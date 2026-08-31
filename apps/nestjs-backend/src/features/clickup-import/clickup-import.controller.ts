import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ClickUpImportService } from './clickup-import.service';

/**
 * Round-17: ClickUp import controller. Exposes 4 minimal endpoints for
 * operators/admins to verify the driver works against a live ClickUp
 * workspace. Token is provided per-request (not stored).
 */
@Controller('api/clickup-import')
export class ClickUpImportController {
  constructor(private readonly service: ClickUpImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { token: string }) {
    return this.service.probe(body.token);
  }

  @Public()
  @Get('spaces')
  async spaces(
    @Query('token') token: string,
    @Query('teamId') teamId: string
  ) {
    return this.service.listSpaces(token, teamId);
  }

  @Public()
  @Get('lists')
  async lists(
    @Query('token') token: string,
    @Query('spaceId') spaceId: string
  ) {
    return this.service.listLists(token, spaceId);
  }

  @Public()
  @Get('tasks')
  async tasks(
    @Query('token') token: string,
    @Query('listId') listId: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.service.fetchTasks(
      token,
      listId,
      pageSize ? Math.min(500, Number(pageSize)) : 100
    );
  }
}
