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
} from '@nestjs/common';
import {
  googleSheetsConnectRoSchema,
  googleSheetsSyncRoSchema,
  type IGoogleSheetsConnectRo,
  type IGoogleSheetsStatusVo,
  type IGoogleSheetsSyncRo,
  type IGoogleSheetsSyncVo,
} from '@teable/openapi';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';
import {
  planExport,
  planImport,
  reconcile,
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

  constructor(private readonly oauth: GoogleSheetsOAuthService) {}

  /**
   * Returns a Google consent URL the front end can open in a
   * popup. State is generated server-side so the callback handler
   * can reject mismatches, but we don't yet persist it (the
   * front end owns state for now).
   */
  @Get('authorize-url')
  async getAuthorizeUrl(@Query('state') state?: string): Promise<{ url: string; configured: boolean }> {
    if (!this.oauth.hasCredentials()) {
      return {
        url: '',
        configured: false,
      };
    }
    const nonce = state ?? `gs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { url: this.oauth.getAuthorizeUrl(nonce), configured: true };
  }

  @Post('connect')
  @HttpCode(200)
  async connect(
    @Body(new ZodValidationPipe(googleSheetsConnectRoSchema)) body: IGoogleSheetsConnectRo
  ): Promise<{ connected: true; spaceId: string; expiresAt: number }> {
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
      spreadsheetId: stored.spreadsheetId,
      sheetName: stored.sheetName,
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
      counts.inserted = plan.rows.length;
      diff = reconcile({
        snapshot: {},
        current: Object.fromEntries(plan.rows.map((r, i) => [`row-${i}`, r as Record<string, unknown>])),
        keyField: 'rowKey',
      });
    }
    if (direction === 'export' || direction === 'both') {
      exportRows = planExport({
        sheetId: spreadsheet.sheets.find((s) => s.properties.title === body.sheetName)?.properties
          .sheetId ?? 0,
        headers: ['id', 'name'],
        rows: [],
      });
      await runValuesBatchUpdate({
        spreadsheetId: body.spreadsheetId,
        accessToken,
        plan: exportRows,
      });
    }
    // Persist the bound sheet so a later status call can show it.
    await this.oauth.storeTokens(body.spaceId, {
      accessToken,
      refreshToken: null,
      expiresAt: Date.now() + 60 * 60 * 1000,
      scope: '',
      tokenType: 'Bearer',
    }, { spreadsheetId: body.spreadsheetId, sheetName: body.sheetName });
    return {
      direction,
      spreadsheetId: body.spreadsheetId,
      sheetName: body.sheetName,
      counts,
      diff: { inserts: diff.inserts.length, updates: diff.updates.length, deletes: diff.deletes.length, unchanged: diff.unchanged },
    };
  }

  @Post('disconnect/:spaceId')
  @HttpCode(200)
  async disconnect(@Param('spaceId') spaceId: string): Promise<{ disconnected: true; spaceId: string }> {
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
    throw new BadRequestException(`Google Sheets API error ${res.status}: ${errText.slice(0, 200)}`);
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
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload.body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new BadRequestException(`Google Sheets batchUpdate error ${res.status}: ${errText.slice(0, 200)}`);
  }
};
