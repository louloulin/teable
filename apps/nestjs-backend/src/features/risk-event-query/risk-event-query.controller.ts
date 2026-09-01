/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk event query — admin HTTP controller (Round-INFRA-7).
 *
 * Queries persisted risk events by actor, email, type, and date range,
 * exposing paged results and exact counts to the admin panel.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { RiskEventQueryAuthService } from './risk-event-query.auth.service';
import type { RiskBandKind, RiskDecisionKind, RiskEventKind } from './risk-event-query.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface IRiskQuery {
  orgId?: string;
  actorId?: string;
  email?: string;
  kind?: string;
  decision?: string;
  band?: string;
  from?: string;
  to?: string;
  limit?: string;
}

function values(value?: string): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function toFilter(query: IRiskQuery) {
  const actorIds = values(query.actorId);
  const emails = values(query.email).map((email) => `email:${email.toLowerCase()}`);
  return {
    ...(values(query.orgId).length ? { orgIds: values(query.orgId) } : {}),
    ...(actorIds.length || emails.length ? { actorIds: [...actorIds, ...emails] } : {}),
    ...(values(query.kind).length ? { kinds: values(query.kind) as RiskEventKind[] } : {}),
    ...(values(query.decision).length
      ? { decisions: values(query.decision) as RiskDecisionKind[] }
      : {}),
    ...(values(query.band).length ? { bands: values(query.band) as RiskBandKind[] } : {}),
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.limit ? { limit: Number(query.limit) } : {}),
  };
}

@Controller('api/admin/risk-event-query')
@UseGuards(AdminGuard)
export class RiskEventQueryAdminController {
  constructor(private readonly svc: RiskEventQueryAuthService) {}

  @Get('query')
  async query(@Query() query: IRiskQuery) {
    const filter = toFilter(query);
    const [decisions, logins] = await Promise.all([
      this.svc.searchDecisions({ filter }),
      this.svc.searchLoginAttempts({ filter }),
    ]);
    const rows = [...decisions.rows, ...logins.rows]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, filter.limit ?? 50);
    const last = rows.at(-1);
    return { total: rows.length, rows, nextCursor: last ? { key: last.occurredAt, id: last.id } : null };
  }

  @Get('count')
  async count(@Query() query: IRiskQuery) {
    const filter = toFilter(query);
    const [decisions, logins] = await Promise.all([
      this.svc.countDecisions({ filter }),
      this.svc.countLoginAttempts({ filter }),
    ]);
    return { count: decisions + logins };
  }
}
