/**
 * Smartsheet Import — Round-21 minimal types; Round-42 extends with
 * `SmartsheetRowPage` for the record-creation path.
 *
 * Smartsheet REST API at https://api.smartsheet.com/2.0/
 * Auth: Authorization header with Bearer access token.
 * Hierarchy: Workspace > Folder > Sheet > Row (with column values).
 *
 * Pagination convention (Round-42):
 *   `GET /sheets/<sheetId>/rows?pageSize=<N>&page=<n>`
 *   - `page` is 1-indexed
 *   - response `rows` carries up to `pageSize` rows
 *   - server may include `page: <number|null>` hinting the next page
 *   - termination: `page === null` OR `rows.length < pageSize`
 */

export interface SmartsheetSheet {
  id: number;
  name: string;
  accessLevel?: string;
  permalink?: string;
  createdAt?: string;
  modifiedAt?: string;
  columnCount?: number;
  rowCount?: number;
}

export interface SmartsheetRow {
  id: number;
  sheetId: number;
  rowNumber?: number;
  cells?: Array<{
    columnId: number;
    value?: string | number | boolean | null;
    displayValue?: string;
    formula?: string;
    format?: string;
  }>;
  createdAt?: string;
  modifiedAt?: string;
}

/**
 * Round-42: paged row fetch result. `nextPage === null` indicates the
 * caller should stop iterating.
 */
export interface SmartsheetRowPage {
  rows: SmartsheetRow[];
  nextPage: number | null;
}

export interface SmartsheetConnectionProbe {
  ok: boolean;
  sheetCount?: number;
  user?: { id: number; email: string };
  error?: string;
  fetchedAt: string;
}
