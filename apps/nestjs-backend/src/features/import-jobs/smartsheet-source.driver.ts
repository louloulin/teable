/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Smartsheet adapter for the unified source-import driver (Phase 4.4+).
 *
 * Smartsheet's model is sheet-centric with row + column orientation:
 *
 *   **sheet** → **row** (each with `cells[]` of `columnId → value`)
 *   → **column** (typed; defines the cell type — TEXT_NUMBER,
 *   CHECKBOX, DATE, DATETIME, CONTACT_LIST, PICKLIST, MULTI_PICKLIST,
 *   DURATION, ABSTRACT_DATETIME, …)
 *   → **attachment** / **comment** / **discussion** (secondary).
 *
 * Pagination uses opaque `page` (next page token returned in response)
 * — different from offset, different from cursor. The Phase 4.4+ stub
 * validates payload only; a future round adds `SmartsheetImportService`:
 *
 *   1. `GET https://api.smartsheet.com/2.0/sheets/<sheetId>` with
 *      `Authorization: Bearer <token>`;
 *   2. `GET /sheets/<sheetId>?page=<nextPageToken>&pageSize=500`
 *      iterating while response includes a `page` field in body;
 *   3. decode `cells[]` per `columnType` registry;
 *   4. write through `recordOpenApiV2Service.createRecords`.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface ISmartsheetTaskPayload {
  /** Smartsheet sheet id. Falls back to `task.remoteId`. Required. */
  sheetId?: string;
  /** Page size override (default 500, Smartsheet max per-page). */
  pageSize?: number;
  /** Include cross-sheet references (default false — they require a second round trip). */
  includeCrossSheetRefs?: boolean;
  /** API access token. Read from connection row once registered. */
  accessToken?: string;
}

export class SmartsheetInvalidPayloadError extends Error {
  readonly code = 'SMARTSHEET_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `smartsheet import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'SmartsheetInvalidPayloadError';
  }
}

export class SmartsheetNotConfiguredError extends Error {
  readonly code = 'SMARTSHEET_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { sheetId: string }) {
    const remediation =
      'add SmartsheetImportService: Bearer auth against ' +
      'https://api.smartsheet.com/2.0/, resolve sheetId via ' +
      'GET /sheets/<sheetId>, stream rows via ' +
      'GET /sheets/<sheetId>?page=<nextPageToken>&pageSize=500 with opaque ' +
      'page-based pagination (response.page is the next token, null when done), ' +
      'decode cells[] per columnType registry (TEXT_NUMBER, CHECKBOX, DATE, ' +
      'DATETIME, CONTACT_LIST, PICKLIST, MULTI_PICKLIST, DURATION, ' +
      'ABSTRACT_DATETIME, …), optional second pass for cross-sheet references ' +
      'and discussions, write through recordOpenApiV2Service.createRecords. ' +
      'Replace the stub body in SmartsheetSourceDriver.runImport().';
    super(
      `Smartsheet REST client not configured (sheet=${input.sheetId}); ${remediation}`
    );
    this.name = 'SmartsheetNotConfiguredError';
    this.remediation = remediation;
  }
}

@Injectable()
export class SmartsheetSourceDriver implements ISourceImportDriver {
  readonly source = 'smartsheet' as const;
  private readonly logger = new Logger(SmartsheetSourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new SmartsheetInvalidPayloadError(['spaceId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as ISmartsheetTaskPayload;
    const sheetId = payload.sheetId ?? input.task.remoteId;
    if (!sheetId) {
      throw new SmartsheetInvalidPayloadError(['sheetId']);
    }

    if (input.isCanceled()) {
      throw new Error('SMARTSHEET_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('SMARTSHEET_CANCELED');
    }

    this.logger.warn(
      `smartsheet import ${input.task.id} requested but Smartsheet REST ` +
        `client not yet wired (sheet=${sheetId})`
    );
    throw new SmartsheetNotConfiguredError({ sheetId });
  }
}
