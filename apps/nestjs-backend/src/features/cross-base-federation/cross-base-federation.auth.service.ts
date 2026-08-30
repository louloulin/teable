/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Cross-base federation — NestJS auth service (Stage 74).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  aliasMap,
  consumeEvents,
  finishRefresh,
  shouldRefreshNow,
  startRefresh,
  validateSource,
  validateView,
} from './cross-base-federation.service';
import type {
  FederationRefreshMode,
  FederationStatus,
  IFederationEvent,
  IFederationRefresh,
  IFederationSource,
  IFederationView,
} from './cross-base-federation.types';

@Injectable()
export class CrossBaseFederationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a view. */
  validateView(v: IFederationView): string | null {
    return validateView(v);
  }

  /** Validate a source. */
  validateSource(s: IFederationSource, viewId: string): string | null {
    return validateSource(s, viewId);
  }

  /** Persist a view (upsert). */
  async upsertView(v: IFederationView): Promise<IFederationView> {
    const err = validateView(v);
    if (err) throw new Error(`invalid view: ${err}`);
    await this.prisma.federationView.upsert({
      where: { id: v.id },
      create: {
        id: v.id,
        orgId: v.orgId,
        name: v.name,
        description: v.description,
        status: v.status,
        refreshMode: v.refreshMode,
        refreshIntervalSeconds: v.refreshIntervalSeconds,
        lastRefreshedBy: v.lastRefreshedBy,
        lastRefreshedAt: v.lastRefreshedAt ? new Date(v.lastRefreshedAt) : null,
        lastStalenessSeconds: v.lastStalenessSeconds,
      },
      update: {
        name: v.name,
        description: v.description,
        status: v.status,
        refreshMode: v.refreshMode,
        refreshIntervalSeconds: v.refreshIntervalSeconds,
        lastRefreshedBy: v.lastRefreshedBy,
        lastRefreshedAt: v.lastRefreshedAt ? new Date(v.lastRefreshedAt) : null,
        lastStalenessSeconds: v.lastStalenessSeconds,
      },
    });
    return v;
  }

  /** Load a view by id. */
  async loadView(id: string): Promise<IFederationView | null> {
    const row = await this.prisma.federationView.findUnique({ where: { id } });
    return row ? toView(row) : null;
  }

  /** List views for an org. */
  async listViews(orgId: string): Promise<IFederationView[]> {
    const rows = await this.prisma.federationView.findMany({ where: { orgId } });
    return rows.map(toView);
  }

  /** Persist a source. */
  async upsertSource(s: IFederationSource, viewId: string): Promise<IFederationSource> {
    const err = validateSource(s, viewId);
    if (err) throw new Error(`invalid source: ${err}`);
    await this.prisma.federationSource.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        viewId,
        baseId: s.baseId,
        kind: s.kind,
        targetId: s.targetId,
        alias: s.alias,
        fields: s.fields === null ? undefined : (s.fields as unknown as object),
        filter: s.filter,
      },
      update: {
        baseId: s.baseId,
        kind: s.kind,
        targetId: s.targetId,
        alias: s.alias,
        fields: s.fields === null ? undefined : (s.fields as unknown as object),
        filter: s.filter,
      },
    });
    return s;
  }

  /** List sources for a view. */
  async listSources(viewId: string): Promise<IFederationSource[]> {
    const rows = await this.prisma.federationSource.findMany({ where: { viewId } });
    return rows.map(toSource);
  }

  /** Build the alias map. */
  aliasMap(sources: IFederationSource[]): Record<string, IFederationSource> {
    return aliasMap(sources);
  }

  /** Record an event. */
  async recordEvent(input: {
    id: string;
    viewId: string;
    sourceId: string;
    kind: string;
    summary: string;
  }): Promise<IFederationEvent> {
    const nowIso = new Date().toISOString();
    const event: IFederationEvent = {
      id: input.id,
      viewId: input.viewId,
      sourceId: input.sourceId,
      kind: input.kind,
      occurredAt: nowIso,
      summary: input.summary,
      processed: false,
    };
    await this.prisma.federationEvent.create({
      data: {
        id: event.id,
        viewId: event.viewId,
        sourceId: event.sourceId,
        kind: event.kind,
        summary: event.summary,
        occurredAt: new Date(event.occurredAt),
        processed: false,
      },
    });
    return event;
  }

  /** List pending events for a view. */
  async listPendingEvents(viewId: string): Promise<IFederationEvent[]> {
    const rows = await this.prisma.federationEvent.findMany({
      where: { viewId, processed: false },
    });
    return rows.map(toEvent);
  }

  /** Decide if the view should refresh now. */
  shouldRefresh(view: IFederationView, pending: IFederationEvent[]): boolean {
    return shouldRefreshNow({ view, pendingEvents: pending });
  }

  /** Run a refresh. */
  async runRefresh(input: {
    viewId: string;
    actorId: string;
    refreshName?: string;
  }): Promise<IFederationRefresh> {
    const job = startRefresh({
      id: input.refreshName ?? `refresh-${input.viewId}-${Date.now()}`,
      viewId: input.viewId,
    });
    const pending = await this.listPendingEvents(input.viewId);
    const processed = consumeEvents({ events: pending });
    const view = await this.loadView(input.viewId);
    void view;
    void input.actorId;
    return finishRefresh({
      job,
      status: 'done',
      eventsConsumed: processed.length,
      rowsWritten: processed.length * 10,
    });
  }

  /** Persist a refresh job. */
  async persistRefresh(job: IFederationRefresh): Promise<IFederationRefresh> {
    await this.prisma.federationRefresh.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        viewId: job.viewId,
        status: job.status,
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        eventsConsumed: job.eventsConsumed,
        rowsWritten: job.rowsWritten,
        durationMs: job.durationMs,
        lastError: job.lastError,
      },
      update: {
        status: job.status,
        startedAt: job.startedAt ? new Date(job.startedAt) : null,
        finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
        eventsConsumed: job.eventsConsumed,
        rowsWritten: job.rowsWritten,
        durationMs: job.durationMs,
        lastError: job.lastError,
      },
    });
    return job;
  }
}

function toView(row: Record<string, unknown>): IFederationView {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    name: String(row['name'] ?? ''),
    description: String(row['description'] ?? ''),
    status: String(row['status']) as FederationStatus,
    refreshMode: String(row['refreshMode']) as FederationRefreshMode,
    refreshIntervalSeconds:
      typeof row['refreshIntervalSeconds'] === 'number'
        ? (row['refreshIntervalSeconds'] as number)
        : 60,
    lastRefreshedBy:
      row['lastRefreshedBy'] === null || row['lastRefreshedBy'] === undefined
        ? null
        : String(row['lastRefreshedBy']),
    lastRefreshedAt:
      row['lastRefreshedAt'] === null || row['lastRefreshedAt'] === undefined
        ? null
        : new Date(String(row['lastRefreshedAt'])).toISOString(),
    lastStalenessSeconds:
      row['lastStalenessSeconds'] === null || row['lastStalenessSeconds'] === undefined
        ? null
        : (row['lastStalenessSeconds'] as number),
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}

function toSource(row: Record<string, unknown>): IFederationSource {
  const fields = row['fields'];
  return {
    id: String(row['id']),
    baseId: String(row['baseId']),
    kind: String(row['kind']) as IFederationSource['kind'],
    targetId: String(row['targetId']),
    alias: String(row['alias']),
    fields: Array.isArray(fields) ? (fields as string[]) : null,
    filter: row['filter'] === null || row['filter'] === undefined ? null : String(row['filter']),
  };
}

function toEvent(row: Record<string, unknown>): IFederationEvent {
  return {
    id: String(row['id']),
    viewId: String(row['viewId']),
    sourceId: String(row['sourceId']),
    kind: String(row['kind']),
    occurredAt: new Date(String(row['occurredAt'] ?? Date.now())).toISOString(),
    summary: String(row['summary'] ?? ''),
    processed: Boolean(row['processed']),
  };
}
