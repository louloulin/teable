import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { DEFAULT_BATCH_SIZE, deliverSiemBatch, exportAuditEvents } from './audit-export.service';
import type {
  AuditExportFormat,
  IAuditEventRow,
  IAuditExportResult,
  ISiemWebhookInput,
} from './audit-export.types';

/**
 * Audit log export + SIEM forwarding — Stage 24.
 *
 * The export controller calls `export()` to materialize a CSV / JSON /
 * JSONL payload; the SIEM job calls `deliverAll()` to fan every
 * subscribed webhook out to its endpoint with retries.
 */
@Injectable()
export class AuditExportAuthService {
  /** Soft cap on rows per export — keeps memory bounded. */
  static readonly MAX_EXPORT_ROWS = 50_000;

  constructor(private readonly prisma: PrismaService) {}

  /** Materialize an export over a date window. */
  async export(input: {
    organizationId: string;
    from?: Date;
    to?: Date;
    format: AuditExportFormat;
    actorId?: string;
    action?: string;
  }): Promise<IAuditExportResult> {
    const events = await this.loadEvents(input);
    return exportAuditEvents({
      events: events as IAuditEventRow[],
      format: input.format,
      from: input.from,
      to: input.to,
    });
  }

  /**
   * Fan out a recent batch of events to every enabled webhook that
   * matches. Returns per-webhook delivery results so a cron / Bull job
   * can update `lastDeliveredAt` / `lastError`.
   */
  async deliverAll(input: {
    organizationId: string;
    from?: Date;
    to?: Date;
  }): Promise<
    Array<{ webhookId: string; label: string; ok: boolean; status: number; attempts: number }>
  > {
    const events = await this.loadEvents({
      organizationId: input.organizationId,
      from: input.from,
      to: input.to,
    });
    const webhooks = await this.prisma.siemWebhook.findMany({
      where: { organizationId: input.organizationId, enabled: true },
    });
    const results: Array<{
      webhookId: string;
      label: string;
      ok: boolean;
      status: number;
      attempts: number;
    }> = [];
    for (const w of webhooks) {
      const row = await this.prisma.siemWebhook.findUnique({ where: { id: w.id } });
      if (!row) continue;
      const webhook: ISiemWebhookInput = {
        id: row.id,
        organizationId: row.organizationId,
        label: row.label,
        url: row.url,
        secret: row.secret,
        enabled: row.enabled,
        actions: row.actions,
      };
      const r = await deliverSiemBatch({ webhook, events: events as IAuditEventRow[] });
      results.push({
        webhookId: row.id,
        label: row.label,
        ok: r.ok,
        status: r.status,
        attempts: r.attempts,
      });
      await this.prisma.siemWebhook.update({
        where: { id: row.id },
        data: r.ok
          ? { lastDeliveredAt: new Date(), lastError: null, lastErrorAt: null }
          : { lastErrorAt: new Date(), lastError: `HTTP ${r.status}` },
      });
    }
    return results;
  }

  /** Helper for the Bull job: split a large event set into bounded batches. */
  static chunk<T>(items: T[], size = DEFAULT_BATCH_SIZE): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }

  // --- internals ---

  private async loadEvents(input: {
    organizationId: string;
    from?: Date;
    to?: Date;
    actorId?: string;
    action?: string;
  }): Promise<IAuditEventRow[]> {
    const where: Record<string, unknown> = {};
    if (input.organizationId) where.organizationId = input.organizationId;
    if (input.actorId) where.actorId = input.actorId;
    if (input.action) where.action = input.action;
    if (input.from || input.to) {
      where.createdTime = {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {}),
      };
    }
    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdTime: 'asc' },
      take: AuditExportAuthService.MAX_EXPORT_ROWS,
    });
  }
}
