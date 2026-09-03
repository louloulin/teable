/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SmartSuite adapter for the unified source-import driver (Phase 4.4+).
 *
 * SmartSuite's data model is application-centric:
 *
 *   **workspace** → **solution** (a packaged app) → **app** (a table)
 *   → **record** (the row) → **field_values** (typed cells).
 *
 * SmartSuite API is REST with bearer auth, paginated via
 * `offset` + `limit` query params. The Phase 4.4+ stub validates
 * payload only; a future round adds `SmartSuiteImportService`:
 *
 *   1. `GET /v1/apps/<appId>/records/list/?offset=0&limit=200` with
 *      `Authorization: Token <apiKey>` (note: `Token` prefix, not
 *      `Bearer`);
 *   2. iterate while response `offset` is non-null (SmartSuite
 *      returns the NEXT offset, not last);
 *   3. decode `field_values[]` per the field-type registry
 *      (`singleselect`, `multiselect`, `text`, `number`, `date`,
 *      `datetime`, `user`, `file`, `checklist`, `linkedrecord`, …);
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

export interface ISmartSuiteTaskPayload {
  /** SmartSuite workspace id (tenant). Optional. */
  workspaceId?: string;
  /** SmartSuite solution id (the packaged app bundle). Optional. */
  solutionId?: string;
  /** SmartSuite app id (the table). Falls back to `task.remoteId`. Required. */
  appId?: string;
  /** Page size override (default 200, SmartSuite typical max). */
  limit?: number;
  /** API key (Token auth). Read from connection row once registered. */
  apiKey?: string;
  /** Whether to fetch comments. Default false. */
  includeComments?: boolean;
}

export class SmartSuiteInvalidPayloadError extends Error {
  readonly code = 'SMARTSUITE_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `smartsuite import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'SmartSuiteInvalidPayloadError';
  }
}

export class SmartSuiteNotConfiguredError extends Error {
  readonly code = 'SMARTSUITE_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { appId: string }) {
    const remediation =
      'add SmartSuiteImportService: Token auth (Authorization: Token <key>, NOT ' +
      'Bearer) against https://api.smartsuite.com/v1/, stream records via ' +
      'GET /v1/apps/<appId>/records/list/?offset=&limit= with offset-based ' +
      'pagination (response.offset is the NEXT cursor), decode field_values[] ' +
      'per type (singleselect, multiselect, text, number, date, datetime, user, ' +
      'file, checklist, linkedrecord, …), optional second pass for comments, ' +
      'write through recordOpenApiV2Service.createRecords. Replace the stub ' +
      'body in SmartSuiteSourceDriver.runImport().';
    super(
      `SmartSuite REST client not configured (app=${input.appId}); ${remediation}`
    );
    this.name = 'SmartSuiteNotConfiguredError';
    this.remediation = remediation;
  }
}

@Injectable()
export class SmartSuiteSourceDriver implements ISourceImportDriver {
  readonly source = 'smartsuite' as const;
  private readonly logger = new Logger(SmartSuiteSourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new SmartSuiteInvalidPayloadError(['spaceId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as ISmartSuiteTaskPayload;
    const appId = payload.appId ?? input.task.remoteId;
    if (!appId) {
      throw new SmartSuiteInvalidPayloadError(['appId']);
    }

    if (input.isCanceled()) {
      throw new Error('SMARTSUITE_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('SMARTSUITE_CANCELED');
    }

    this.logger.warn(
      `smartsuite import ${input.task.id} requested but SmartSuite REST ` +
        `client not yet wired (app=${appId})`
    );
    throw new SmartSuiteNotConfiguredError({ appId });
  }
}
