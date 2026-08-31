/**
 * Smartsheet Import — Round-21 minimal types.
 *
 * Smartsheet REST API at https://api.smartsheet.com/2.0/
 * Auth: Authorization header with Bearer access token.
 * Hierarchy: Workspace > Folder > Sheet > Row (with column values).
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
  }>;
  createdAt?: string;
  modifiedAt?: string;
}

export interface SmartsheetConnectionProbe {
  ok: boolean;
  sheetCount?: number;
  user?: { id: number; email: string };
  error?: string;
  fetchedAt: string;
}
