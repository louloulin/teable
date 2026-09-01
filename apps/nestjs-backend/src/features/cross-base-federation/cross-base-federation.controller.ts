import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { Public } from '../auth/decorators/public.decorator';
import type { IClsStore } from '../../types/cls';

import { CrossBaseFederationAuthService } from './cross-base-federation.auth.service';
import { normalizeSource, normalizeView } from './cross-base-federation.service';
import type {
  FederationRefreshMode,
  FederationSourceKind,
  FederationStatus,
  IFederationEvent,
  IFederationRefresh,
  IFederationSource,
  IFederationView,
} from './cross-base-federation.types';

/**
 * Round-30: Cross-base federation HTTP controller.
 *
 * Exposes CrossBaseFederationAuthService (federation view + source CRUD,
 * event recording, refresh orchestration) over HTTP. Without this
 * controller, the federated-view capability is unreachable — same
 * "service exists, no surface" gap that R28/R29 fixed for other features.
 *
 * Routes (all under /api/cross-base-federation):
 *   PUT    /views/:id                          upsert federation view
 *   GET    /views/:id                          load federation view
 *   GET    /orgs/:orgId/views                  list views in an org
 *   PUT    /views/:viewId/sources/:id          upsert federation source
 *   GET    /views/:viewId/sources              list sources for a view
 *   POST   /views/:viewId/events               record a change event
 *   GET    /views/:viewId/events               list pending events
 *   POST   /views/:viewId/refresh              run a refresh now
 *   PUT    /refreshes/:id                      persist a refresh record
 */
@Public()
@Controller('api/cross-base-federation')
export class CrossBaseFederationController {
  constructor(
    private readonly auth: CrossBaseFederationAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  // ---- View CRUD ----

  @Put('views/:id')
  @HttpCode(200)
  async upsertView(
    @Param('id') id: string,
    @Body()
    body: {
      orgId: string;
      name: string;
      description?: string;
      status?: FederationStatus;
      refreshMode?: FederationRefreshMode;
      refreshIntervalSeconds?: number;
    }
  ): Promise<IFederationView> {
    if (!body?.orgId || !body?.name) {
      throw new BadRequestException('orgId, name required');
    }
    return this.auth.upsertView(
      normalizeView({ id, ...body })
    );
  }

  @Get('views/:id')
  async loadView(@Param('id') id: string): Promise<IFederationView | { view: null }> {
    const v = await this.auth.loadView(id);
    return v ?? { view: null };
  }

  @Get('orgs/:orgId/views')
  async listViews(
    @Param('orgId') orgId: string
  ): Promise<{ views: IFederationView[] }> {
    return { views: await this.auth.listViews(orgId) };
  }

  // ---- Source CRUD ----

  @Put('views/:viewId/sources/:id')
  @HttpCode(200)
  async upsertSource(
    @Param('viewId') viewId: string,
    @Param('id') id: string,
    @Body()
    body: {
      baseId: string;
      kind: FederationSourceKind;
      targetId: string;
      alias: string;
      fields?: string[] | null;
      filter?: string | null;
    }
  ): Promise<IFederationSource> {
    if (!body?.baseId || !body?.kind || !body?.targetId || !body?.alias) {
      throw new BadRequestException('baseId, kind, targetId, alias required');
    }
    return this.auth.upsertSource(
      normalizeSource({ id, ...body }),
      viewId
    );
  }

  @Get('views/:viewId/sources')
  async listSources(
    @Param('viewId') viewId: string
  ): Promise<{ sources: IFederationSource[] }> {
    return { sources: await this.auth.listSources(viewId) };
  }

  // ---- Event flow ----

  @Post('views/:viewId/events')
  @HttpCode(200)
  async recordEvent(
    @Param('viewId') viewId: string,
    @Body() body: { id: string; sourceId: string; kind: string; summary?: string }
  ): Promise<IFederationEvent> {
    if (!body?.id || !body?.sourceId || !body?.kind) {
      throw new BadRequestException('id, sourceId, kind required');
    }
    return this.auth.recordEvent({
      id: body.id,
      viewId,
      sourceId: body.sourceId,
      kind: body.kind,
      summary: body.summary ?? '',
    });
  }

  @Get('views/:viewId/events')
  async listPendingEvents(
    @Param('viewId') viewId: string
  ): Promise<{ events: IFederationEvent[] }> {
    return { events: await this.auth.listPendingEvents(viewId) };
  }

  // ---- Refresh orchestration ----

  @Post('views/:viewId/refresh')
  @HttpCode(200)
  async runRefresh(
    @Param('viewId') viewId: string,
    @Body() body: { triggeredBy?: string }
  ): Promise<IFederationRefresh> {
    return this.auth.runRefresh({
      viewId,
      actorId: this.cls.get('user')?.id ?? 'system',
      refreshName: body?.triggeredBy ?? undefined,
    });
  }

  @Put('refreshes/:id')
  @HttpCode(200)
  async persistRefresh(
    @Param('id') id: string,
    @Body()
    body: {
      viewId: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      startedAt?: string | null;
      finishedAt?: string | null;
      eventsConsumed?: number;
      rowsWritten?: number;
      durationMs?: number | null;
      lastError?: string | null;
    }
  ): Promise<IFederationRefresh> {
    if (!body?.viewId || !body?.status) {
      throw new BadRequestException('viewId, status required');
    }
    return this.auth.persistRefresh({
      id,
      viewId: body.viewId,
      status: body.status,
      startedAt: body.startedAt ?? null,
      finishedAt: body.finishedAt ?? null,
      eventsConsumed: body.eventsConsumed ?? 0,
      rowsWritten: body.rowsWritten ?? 0,
      durationMs: body.durationMs ?? null,
      lastError: body.lastError ?? null,
    });
  }
}
