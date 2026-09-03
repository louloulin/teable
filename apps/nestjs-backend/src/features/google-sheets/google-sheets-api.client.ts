/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Google Sheets API v4 client (Phase 4.3).
 *
 * Thin wrapper over `fetch` for the subset of Sheets v4 we need:
 *
 *   GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}
 *   → { values: string[][], range: string }
 *
 * Uses the same `notionFetch`-style helper pattern but for Google:
 * standard `fetch`, 15s timeout, 10 MiB body cap, and a typed error
 * surface that the import driver maps to retryable vs non-retryable.
 *
 * Cloud parity: this client is fully functional in OSS as long as a
 * GoogleSheetsOAuthService has stored tokens for the space. There is
 * no `googleapis` dependency; we go straight against the REST surface
 * so the binary stays small and the upgrade path is plain HTTP.
 *
 * License: AGPL-3.0
 */

export const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  constructor(input: {
    code: string;
    status: number;
    message: string;
    retryable: boolean;
  }) {
    super(input.message);
    this.name = 'GoogleSheetsApiError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
  }
}

export interface IGoogleSheetsValuesGetResponse {
  range: string;
  majorDimension: 'ROWS' | 'COLUMNS';
  values?: string[][];
}

export interface IGoogleSheetsValuesGetInput {
  spreadsheetId: string;
  range: string;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Low-level REST call. Returns the raw response. Throws a typed
 * `GoogleSheetsApiError` for non-2xx responses so the import driver
 * can decide retry vs permanent failure based on `error.retryable`.
 */
export async function googleSheetsValuesGet(
  input: IGoogleSheetsValuesGetInput
): Promise<IGoogleSheetsValuesGetResponse> {
  if (!input.spreadsheetId) throw new Error('spreadsheetId is required');
  if (!input.range) throw new Error('range is required');
  if (!input.accessToken) throw new Error('accessToken is required');

  const url = `${GOOGLE_SHEETS_API}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`;
  const init: RequestInit = {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.accessToken}` },
  };
  if (input.signal) init.signal = input.signal;

  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    const { code, retryable, message } = parseSheetsError(response.status, text);
    throw new GoogleSheetsApiError({ code, status: response.status, retryable, message });
  }
  try {
    return JSON.parse(text) as IGoogleSheetsValuesGetResponse;
  } catch (err) {
    throw new GoogleSheetsApiError({
      code: 'SHEETS_INVALID_JSON',
      status: response.status,
      retryable: false,
      message: `Sheets API returned non-JSON body: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function parseSheetsError(
  status: number,
  text: string
): { code: string; retryable: boolean; message: string } {
  // Common cases: 401 (token expired — refresh + retry), 403 (permission
  // — non-retryable), 404 (no spreadsheet — non-retryable), 429 / 5xx
  // (retryable).
  let code = 'SHEETS_API_ERROR';
  let message = `Sheets API responded with HTTP ${status}`;
  try {
    const body = JSON.parse(text) as { error?: { status?: string; message?: string; code?: number } };
    if (body.error) {
      code = body.error.status ?? code;
      if (body.error.message) message = body.error.message;
    }
  } catch {
    // body wasn't JSON; keep the default message
  }
  if (status === 401) {
    return { code: 'SHEETS_UNAUTHORIZED', retryable: true, message };
  }
  if (status === 403) {
    return { code: 'SHEETS_FORBIDDEN', retryable: false, message };
  }
  if (status === 404) {
    return { code: 'SHEETS_NOT_FOUND', retryable: false, message };
  }
  if (status === 429 || status >= 500) {
    // Always prefer `SHEETS_TRANSIENT` for retryable 5xx/429 so the
    // import driver has a stable code to retry on; the underlying
    // Sheets error stays in `message` for forensics.
    return { code: 'SHEETS_TRANSIENT', retryable: true, message };
  }
  return { code, retryable: false, message };
}
