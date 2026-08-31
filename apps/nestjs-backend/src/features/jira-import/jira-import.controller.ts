import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { JiraImportService } from './jira-import.service';

/**
 * Round-18: Jira import controller. Exposes 3 minimal endpoints for
 * operators/admins to verify the driver works against a live Jira Cloud
 * instance. Site URL + email + API token are provided per-request (not stored).
 */
@Controller('api/jira-import')
export class JiraImportController {
  constructor(private readonly service: JiraImportService) {}

  @Public()
  @Post('probe')
  async probe(@Body() body: { siteUrl: string; email: string; apiToken: string }) {
    return this.service.probe(body.siteUrl, body.email, body.apiToken);
  }

  @Public()
  @Get('projects')
  async projects(
    @Query('siteUrl') siteUrl: string,
    @Query('email') email: string,
    @Query('apiToken') apiToken: string,
    @Query('maxResults') maxResults?: string
  ) {
    return this.service.listProjects(
      siteUrl,
      email,
      apiToken,
      maxResults ? Math.min(200, Number(maxResults)) : 50
    );
  }

  @Public()
  @Get('issues')
  async issues(
    @Query('siteUrl') siteUrl: string,
    @Query('email') email: string,
    @Query('apiToken') apiToken: string,
    @Query('jql') jql?: string,
    @Query('maxResults') maxResults?: string
  ) {
    return this.service.fetchIssues(
      siteUrl,
      email,
      apiToken,
      jql,
      maxResults ? Math.min(500, Number(maxResults)) : 100
    );
  }
}
