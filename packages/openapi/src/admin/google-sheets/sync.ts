/**
 * Google Sheets admin — sync (T-15 Wave 10).
 *
 *   POST /api/admin/google-sheets/sync
 *
 * Bidirectional sync between a Teable table and a Google Sheets
 * spreadsheet. The controller dispatches import / export / both
 * based on `direction` and returns rolled-up counts plus a
 * diff summary so the front end can show "X inserted, Y updated,
 * Z deleted" without re-fetching the sheet.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';
import { z } from '../../zod';

export const SYNC_GOOGLE_SHEETS = '/admin/google-sheets/sync';

export const googleSheetsSyncDirectionSchema = z.enum(['import', 'export', 'both']);

export const googleSheetsSyncRoSchema = z.object({
  spaceId: z.string().min(1),
  tableId: z.string().min(1),
  spreadsheetId: z.string().min(1),
  sheetName: z.string().min(1),
  direction: googleSheetsSyncDirectionSchema,
});

export type IGoogleSheetsSyncRo = z.infer<typeof googleSheetsSyncRoSchema>;

export const googleSheetsSyncCountsVoSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
  deleted: z.number(),
  errors: z.number(),
});

export type IGoogleSheetsSyncCountsVo = z.infer<typeof googleSheetsSyncCountsVoSchema>;

export const googleSheetsSyncDiffSummaryVoSchema = z.object({
  inserts: z.number(),
  updates: z.number(),
  deletes: z.number(),
  unchanged: z.number(),
});

export type IGoogleSheetsSyncDiffSummaryVo = z.infer<typeof googleSheetsSyncDiffSummaryVoSchema>;

export const googleSheetsSyncVoSchema = z.object({
  direction: googleSheetsSyncDirectionSchema,
  spreadsheetId: z.string(),
  sheetName: z.string(),
  counts: googleSheetsSyncCountsVoSchema,
  diff: googleSheetsSyncDiffSummaryVoSchema,
});

export type IGoogleSheetsSyncVo = z.infer<typeof googleSheetsSyncVoSchema>;

export const SyncGoogleSheetsRoute: RouteConfig = registerRoute({
  method: 'post',
  path: SYNC_GOOGLE_SHEETS,
  description: 'Run a bidirectional sync between a Teable table and a Google Sheets sheet',
  request: {
    body: {
      content: {
        'application/json': {
          schema: googleSheetsSyncRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns sync counts and a diff summary keyed by direction',
      content: {
        'application/json': {
          schema: googleSheetsSyncVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const syncGoogleSheets = async (ro: IGoogleSheetsSyncRo) => {
  return axios.post<IGoogleSheetsSyncVo>(SYNC_GOOGLE_SHEETS, ro);
};
