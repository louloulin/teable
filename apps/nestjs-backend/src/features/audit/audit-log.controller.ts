import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuditExportFormat } from '../audit-export/audit-export.types';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AuditLogService } from './audit-log.service';
import type { IAuditLogFilter, IAuditLogPage } from './audit-log.service';

/**
 * Query-side guard for the audit log capability. Re-used by every method
 * on this controller, so the controller is uniformly closed when the
 * current license does not include `audit_log`.
 */
const AuditLogGuard = LicenseCapabilityGuard.for('audit_log');

/**
 * Hard upper bound for `pageSize`. Larger values are clamped silently to
 * keep the endpoint DoS-resistant (a single request can never page-scan
 * the table).
 */
const MAX_PAGE_SIZE = 100;

/**
 * Default page size when the caller omits `pageSize`.
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/admin/audit-log
 *
 * Read-only admin endpoint for paginated/filtered audit log inspection.
 * Capability-gated: requires the current license to include the
 * `audit_log` capability (Pro / Business / Enterprise). Self-hosted OSS
 * without a license gets `402 LICENSE_REQUIRED` before the handler runs.
 *
 * Query parameters (all optional):
 *   - actor         — exact-match `user_id`
 *   - action        — exact-match `action` (e.g. `user.sso.login.success`)
 *   - resourceType  — exact-match `resource_type`
 *   - since / until — ISO8601 timestamps, applied as `createdAt` bounds
 *   - page          — 1-based page index (default 1)
 *   - pageSize      — 1..100, clamped to 100 (default 20)
 *
 * Response: `{ rows: IAuditLogRow[], total: number }` with `rows` ordered
 * by `createdAt desc`.
 */
@Controller('api/admin/audit-log')
@UseGuards(AuditLogGuard)
@Permissions('instance|read')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  async query(
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): Promise<IAuditLogPage> {
    const filter = this.parseFilter({
      actor,
      action,
      resourceType,
      since,
      until,
      page,
      pageSize,
    });
    return this.auditLog.query(filter);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(
    @Query('format') format: string | undefined,
    @Query('actor') actor: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('since') since: string | undefined,
    @Query('until') until: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<string> {
    const exportFormat = this.parseExportFormat(format);
    const filter = this.parseFilter({ actor, action, resourceType, since, until });
    const result = await this.auditLog.export(filter, exportFormat);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename.replace(/[^\w.-]/g, '_')}"`
    );
    return result.body;
  }

  /**
   * Translate raw query-string values into the validated filter DTO.
   *
   * Strings → typed. Numeric strings → parsed + clamped. Date strings →
   * parsed via `Date.parse` and rejected when invalid. Anything malformed
   * → `BadRequestException`, which the global filter maps to a `400`
   * response with a descriptive message.
   */
  private parseFilter(raw: {
    actor?: string;
    action?: string;
    resourceType?: string;
    since?: string;
    until?: string;
    page?: string;
    pageSize?: string;
  }): IAuditLogFilter {
    const filter: IAuditLogFilter = {};

    if (raw.actor !== undefined && raw.actor !== '') {
      filter.actor = raw.actor;
    }
    if (raw.action !== undefined && raw.action !== '') {
      filter.action = raw.action;
    }
    if (raw.resourceType !== undefined && raw.resourceType !== '') {
      filter.resourceType = raw.resourceType;
    }
    if (raw.since !== undefined && raw.since !== '') {
      const since = this.parseDate('since', raw.since);
      filter.since = since;
    }
    if (raw.until !== undefined && raw.until !== '') {
      const until = this.parseDate('until', raw.until);
      filter.until = until;
    }

    filter.page = this.parsePositiveInt('page', raw.page, 1);
    filter.pageSize = this.parsePageSize(raw.pageSize);

    return filter;
  }

  private parseDate(field: string, value: string): Date {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new BadRequestException(`${field} must be a valid ISO8601 timestamp, got: ${value}`);
    }
    return new Date(ms);
  }

  private parsePositiveInt(field: string, raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${field} must be a positive integer, got: ${raw}`);
    }
    return parsed;
  }

  private parsePageSize(raw: string | undefined): number {
    if (raw === undefined || raw === '') return DEFAULT_PAGE_SIZE;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`pageSize must be a positive integer, got: ${raw}`);
    }
    return Math.min(parsed, MAX_PAGE_SIZE);
  }

  private parseExportFormat(raw: string | undefined): AuditExportFormat {
    if (raw === undefined || raw === '') return 'csv';
    if (raw === 'csv' || raw === 'json' || raw === 'jsonl') return raw;
    throw new BadRequestException(`format must be one of csv, json, jsonl, got: ${raw}`);
  }
}
