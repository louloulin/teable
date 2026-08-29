/**
 * Google Sheets admin controller — T-15 Wave 10.
 *
 *   POST   /api/admin/google-sheets/connect            exchange OAuth code, store tokens
 *   GET    /api/admin/google-sheets/status/:spaceId   read connection state
 *   POST   /api/admin/google-sheets/sync              import / export / both
 *   POST   /api/admin/google-sheets/disconnect/:spaceId   clear stored tokens
 *   GET    /api/admin/google-sheets/authorize-url     build the consent URL
 *
 * All routes are gated by `instance|update` (admin) permission via
 * the `@Permissions` decorator — the same pattern used by the
 * existing `AdminOpenApiController` in `features/setting/open-api`.
 *
 * The controller NEVER exposes access / refresh tokens to the
 * client. Status returns a boolean + last-sync metadata; connect
 * returns only `{ connected: true, spaceId }`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import {
  googleSheetsConnectRoSchema,
  googleSheetsSyncRoSchema,
  type IGoogleSheetsConnectRo,
  type IGoogleSheetsStatusVo,
  type IGoogleSheetsSyncRo,
  type IGoogleSheetsSyncVo,
} from '@teable/openapi';
import type { Request, Response } from 'express';
import {
  createOAuthPopupState,
  oauthPopupHtml,
  verifyOAuthPopupState,
} from '../../utils/oauth-popup-state';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';
import {
  importPlanToRecordFields,
  planExport,
  planImport,
  reconcile,
  recordsToExportInput,
  toValuesBatchUpdate,
  type IGoogleSheetsSpreadsheet,
  type IReconcileDiff,
} from './google-sheets-sync.service';

interface ISyncCounts {
  inserted: number;
  updated: number;
  deleted: number;
  errors: number;
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

@Controller('api/admin/google-sheets')
@Permissions('instance|update')
export class GoogleSheetsController {
  private readonly logger = new Logger(GoogleSheetsController.name);

  constructor(
    private readonly oauth: GoogleSheetsOAuthService,
    private readonly recordOpenApiV2Service: RecordOpenApiV2Service
  ) {}

  /**
   * Returns a Google consent URL the front end can open in a
   * popup. State is generated server-side so the callback handler
   * can reject mismatches, but we don't yet persist it (the
   * front end owns state for now).
   */
  @Get('authorize-url')
  async getAuthorizeUrl(
    @Query('spaceId') spaceId: string
  ): Promise<{ url: string; configured: boolean }> {
    if (!this.oauth.hasCredentials()) {
      return {
        url: '',
        configured: false,
      };
    }
    if (!spaceId) throw new BadRequestException('spaceId is required');
    return {
      url: this.oauth.getAuthorizeUrl(createOAuthPopupState('google-sheets', spaceId)),
      configured: true,
    };
  }

  @Get('oauth/callback')
  @Public()
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const verified = verifyOAuthPopupState(state, 'google-sheets');
    const targetOrigin = process.env.PUBLIC_ORIGIN ?? `${req.protocol}://${req.get('host')}`;
    if (error || !code || !verified) {
      res.type('html').send(
        oauthPopupHtml({
          type: 'teable:google-sheets-oauth',
          targetOrigin,
          state,
          error: error ?? 'Invalid or expired OAuth state',
        })
      );
      return;
    }
    res.type('html').send(
      oauthPopupHtml({
        type: 'teable:google-sheets-oauth',
        targetOrigin,
        code,
        state,
      })
    );
  }

  @Post('connect')
  @HttpCode(200)
  async connect(
    @Body(new ZodValidationPipe(googleSheetsConnectRoSchema)) body: IGoogleSheetsConnectRo
  ): Promise<{ connected: true; spaceId: string; expiresAt: number }> {
    const verified = verifyOAuthPopupState(body.state, 'google-sheets');
    if (!verified || verified.spaceId !== body.spaceId) {
      throw new BadRequestException('Invalid or expired Google Sheets OAuth state');
    }
    if (!this.oauth.hasCredentials()) {
      throw new BadRequestException(
        'Google Sheets OAuth is not configured. Set GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.'
      );
    }
    const tokens = await this.oauth.exchangeCode(body.code);
    await this.oauth.storeTokens(body.spaceId, tokens);
    return { connected: true, spaceId: body.spaceId, expiresAt: tokens.expiresAt };
  }

  @Get('status/:spaceId')
  async status(@Param('spaceId') spaceId: string): Promise<IGoogleSheetsStatusVo> {
    const stored = await this.oauth.getStoredTokens(spaceId);
    if (!stored) {
      return { connected: false, spaceId };
    }
    return {
      connected: true,
      spaceId,
      expiresAt: stored.expiresAt,
      scope: stored.scope,
      ...(stored.spreadsheetId ? { spreadsheetId: stored.spreadsheetId } : {}),
      ...(stored.sheetName ? { sheetName: stored.sheetName } : {}),
      storedAt: stored.storedAt,
    };
  }

  @Post('sync')
  @HttpCode(200)
  async sync(
    @Body(new ZodValidationPipe(googleSheetsSyncRoSchema)) body: IGoogleSheetsSyncRo
  ): Promise<IGoogleSheetsSyncVo> {
    if (!body.spaceId || !body.tableId || !body.spreadsheetId || !body.sheetName) {
      throw new BadRequestException('spaceId, tableId, spreadsheetId and sheetName are required');
    }
    if (!['import', 'export', 'both'].includes(body.direction)) {
      throw new BadRequestException('direction must be one of import|export|both');
    }
    const { accessToken } = await this.oauth.getValidAccessToken(body.spaceId);
    const counts: ISyncCounts = { inserted: 0, updated: 0, deleted: 0, errors: 0 };
    const direction = body.direction;
    const spreadsheet = await fetchSpreadsheet({
      spreadsheetId: body.spreadsheetId,
      accessToken,
    });
    let diff: IReconcileDiff = { inserts: [], updates: [], deletes: [], unchanged: 0 };
    let exportRows: ReturnType<typeof planExport> | null = null;

    if (direction === 'import' || direction === 'both') {
      const plan = planImport(spreadsheet, body.sheetName);
      const records = importPlanToRecordFields(plan);
      if (records.length > 0) {
        const created = await this.recordOpenApiV2Service.createRecords(body.tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records: records.map((fields) => ({ fields })),
        });
        counts.inserted = created.records.length;
      }
      diff = reconcile({
        snapshot: {},
        current: Object.fromEntries(
          records.map((record, i) => [`row-${i}`, record as Record<string, unknown>])
        ),
        keyField: 'rowKey',
      });
    }
    if (direction === 'export' || direction === 'both') {
      const { records } = await this.recordOpenApiV2Service.getRecords(body.tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1000,
      });
      const { headers, rows } = recordsToExportInput(records);
      if (headers.length > 0) {
        exportRows = planExport({
          sheetId:
            spreadsheet.sheets.find((s) => s.properties.title === body.sheetName)?.properties
              .sheetId ?? 0,
          headers,
          rows,
        });
        await runValuesBatchUpdate({
          spreadsheetId: body.spreadsheetId,
          accessToken,
          plan: exportRows,
        });
      }
      counts.updated = records.length;
    }
    // Persist the bound sheet so a later status call can show it.
    await this.oauth.storeTokens(
      body.spaceId,
      {
        accessToken,
        refreshToken: null,
        expiresAt: Date.now() + 60 * 60 * 1000,
        scope: '',
        tokenType: 'Bearer',
      },
      { spreadsheetId: body.spreadsheetId, sheetName: body.sheetName }
    );
    return {
      direction,
      spreadsheetId: body.spreadsheetId,
      sheetName: body.sheetName,
      counts,
      diff: {
        inserts: diff.inserts.length,
        updates: diff.updates.length,
        deletes: diff.deletes.length,
        unchanged: diff.unchanged,
      },
    };
  }

  @Post('disconnect/:spaceId')
  @HttpCode(200)
  async disconnect(
    @Param('spaceId') spaceId: string
  ): Promise<{ disconnected: true; spaceId: string }> {
    await this.oauth.clearTokens(spaceId);
    return { disconnected: true, spaceId };
  }

  /**
   * DELETE alias — REST convention says disconnect is DELETE.
   * Kept distinct from POST so existing callers don't break.
   */
  @Delete('disconnect/:spaceId')
  async disconnectDelete(
    @Param('spaceId') spaceId: string
  ): Promise<{ disconnected: true; spaceId: string }> {
    return this.disconnect(spaceId);
  }
}

interface IFetchSpreadsheetArgs {
  spreadsheetId: string;
  accessToken: string;
}

const fetchSpreadsheet = async ({
  spreadsheetId,
  accessToken,
}: IFetchSpreadsheetArgs): Promise<IGoogleSheetsSpreadsheet> => {
  const u = new URL(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`);
  u.searchParams.set('includeGridData', 'true');
  const res = await fetch(u.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new BadRequestException(
      `Google Sheets API error ${res.status}: ${errText.slice(0, 200)}`
    );
  }
  return (await res.json()) as IGoogleSheetsSpreadsheet;
};

interface IRunValuesBatchUpdateArgs {
  spreadsheetId: string;
  accessToken: string;
  plan: ReturnType<typeof planExport>;
}

const runValuesBatchUpdate = async ({
  spreadsheetId,
  accessToken,
  plan,
}: IRunValuesBatchUpdateArgs): Promise<void> => {
  const payload = toValuesBatchUpdate(plan, spreadsheetId);
  // We use the values.batchUpdate endpoint, not the sheets.batchUpdate endpoint:
  // values.batchUpdate is simpler for a full-range overwrite and doesn't
  // require us to resolve a numeric sheetId → grid range.
  const res = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload.body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new BadRequestException(
      `Google Sheets batchUpdate error ${res.status}: ${errText.slice(0, 200)}`
    );
  }
};
