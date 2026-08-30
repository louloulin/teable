/**
 * Admin Notion controller.
 *
 * Mounted at `/api/admin/notion/*`. All four routes are gated by the
 * `admin_panel` license capability so the wizard only renders for users
 * who can actually call them — matches the existing admin routes
 * (`/api/admin/users`, `/api/admin/scim/...`).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Get,
  Logger,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  notionConnectRoSchema,
  notionDatabasesQuerySchema,
  notionDisconnectRoSchema,
  notionImportRoSchema,
  type INotionConnectVo,
  type INotionDatabasesVo,
  type INotionDatabaseSummary,
  type INotionDisconnectVo,
  type INotionImportVo,
} from '@teable/openapi';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createOAuthPopupState,
  oauthPopupHtml,
  verifyOAuthPopupState,
} from '../../utils/oauth-popup-state';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { NotionImportService, type INotionImportResult } from './notion-import.service';
import { NotionOAuthService } from './notion-oauth.service';

const guardFor = (cap: 'admin_panel') => LicenseCapabilityGuard.for(cap);
const NotionGuard = guardFor('admin_panel');

const disconnectBodySchema = notionDisconnectRoSchema;
const connectBodySchema = notionConnectRoSchema;
const databasesQuerySchema = notionDatabasesQuerySchema;
const importBodySchema = notionImportRoSchema;

type IDisconnectBody = z.infer<typeof disconnectBodySchema>;
type IConnectBody = z.infer<typeof connectBodySchema>;
type IDatabasesQuery = z.infer<typeof databasesQuerySchema>;
type IImportBody = z.infer<typeof importBodySchema>;

@Controller('api/admin/notion')
export class NotionController {
  private readonly logger = new Logger(NotionController.name);

  constructor(
    private readonly oauthService: NotionOAuthService,
    private readonly importService: NotionImportService
  ) {}

  @Get('authorize')
  @UseGuards(NotionGuard)
  @Permissions('instance|update')
  authorize(@Query('spaceId') spaceId: string, @Res() res: Response): void {
    if (!spaceId) throw new BadRequestException('spaceId is required');
    res.redirect(this.oauthService.getAuthorizeUrl(createOAuthPopupState('notion', spaceId)));
  }

  @Get('oauth/callback')
  @Public()
  oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ): void {
    const verified = verifyOAuthPopupState(state, 'notion');
    const targetOrigin = process.env.PUBLIC_ORIGIN ?? `${req.protocol}://${req.get('host')}`;
    res.type('html').send(
      oauthPopupHtml({
        type: error || !code || !verified ? 'notion-oauth-error' : 'notion-oauth-code',
        targetOrigin,
        code: code && verified ? code : undefined,
        state: verified ? state : undefined,
        error: error ?? (!code || !verified ? 'Invalid or expired OAuth state' : undefined),
      })
    );
  }

  /**
   * Step 1 of the wizard — exchange the OAuth code for a token and persist
   * the resulting grant for the requested space. Returns the workspace
   * metadata so the wizard can show "Connected to {workspaceName}".
   */
  @Post('connect')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async connect(
    @Body(new ZodValidationPipe(connectBodySchema)) body: IConnectBody
  ): Promise<INotionConnectVo> {
    const verified = verifyOAuthPopupState(body.state, 'notion');
    if (!verified || verified.spaceId !== body.spaceId) {
      throw new BadRequestException('Invalid or expired Notion OAuth state');
    }
    const tokens = await this.oauthService.exchangeCode(body.code);
    await this.oauthService.storeTokens(body.spaceId, tokens);
    return {
      connected: true,
      workspaceName: tokens.workspaceName ?? 'Notion workspace',
      workspaceId: tokens.workspaceId,
      botId: tokens.botId,
    };
  }

  /**
   * Step 2 of the wizard — list the Notion databases the stored token can
   * see. The wizard's picker only needs `id` + `title`, but the full raw
   * `properties` payload is passed through so step 3 can render the
   * field-mapping preview without a second round-trip.
   */
  @Get('databases')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async databases(
    @Query(new ZodValidationPipe(databasesQuerySchema)) query: IDatabasesQuery
  ): Promise<INotionDatabasesVo> {
    const databases = await this.importService.listDatabases(query.spaceId);
    return {
      databases: databases.map<INotionDatabaseSummary>((database) => ({
        id: database.id,
        title: database.title || 'Untitled database',
        properties: database.properties,
      })),
    };
  }

  /**
   * Step 3 of the wizard — actually pull the pages and write them as
   * Teable records. `tableId` must point at an existing Teable table whose
   * schema was built by the wizard from the step-2 mapping preview.
   */
  @Post('import')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async import(
    @Body(new ZodValidationPipe(importBodySchema)) body: IImportBody
  ): Promise<INotionImportVo> {
    let result: INotionImportResult;
    try {
      result = await this.importService.importDatabase({
        spaceId: body.spaceId,
        tableId: body.tableId,
        databaseId: body.databaseId,
        incremental: body.incremental,
      });
    } catch (error) {
      this.logger.warn(
        `Notion import failed (spaceId=${body.spaceId} databaseId=${body.databaseId}): ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Notion import failed'
      );
    }
    return {
      imported: result.imported,
      skipped: result.skipped,
      ...(result.lastEditedTime ? { lastEditedTime: result.lastEditedTime } : {}),
    };
  }

  @Post('disconnect')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async disconnect(
    @Body(new ZodValidationPipe(disconnectBodySchema)) _body: IDisconnectBody
  ): Promise<INotionDisconnectVo> {
    await this.oauthService.clearTokens(_body.spaceId);
    return { disconnected: true };
  }
}
