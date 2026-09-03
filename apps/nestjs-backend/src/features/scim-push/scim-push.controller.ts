/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SCIM Push provisioning — admin HTTP controller (Stage 67).
 *
 * Manages outbound push subscriptions: IdPs (Okta / Azure AD / OneLogin)
 * register an HTTPS endpoint + HMAC secret; whenever a user/group event
 * occurs inside this instance, we POST a signed JSON envelope to the endpoint.
 *
 * Routes (admin-only, instance|update):
 *   GET    /api/admin/scim-push/subscriptions/:orgId
 *   POST   /api/admin/scim-push/subscriptions          upsert
 *   DELETE /api/admin/scim-push/subscriptions/:id      disable (soft)
 *   GET    /api/admin/scim-push/deliveries/:id         show one delivery
 *   POST   /api/admin/scim-push/dispatch               fire a test event
 *
 * The controller is intentionally thin — every transformation lives in
 * ScimPushService (pure) or ScimPushAuthService (Prisma).
 *
 * License: AGPL-3.0
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { ScimPushAuthService } from './scim-push.auth.service';
import { normalizeSubscription, validateSubscription } from './scim-push.service';
import type {
  IScimPushSubscription,
  ScimPushEventKind,
} from './scim-push.types';

const ScimPushGuard = LicenseCapabilityGuard.for('sso');

interface ICreateSubBody {
  id?: string;
  orgId: string;
  label?: string;
  endpoint: string;
  signingSecret: string;
  filter?: ScimPushEventKind[];
  enabled?: boolean;
}

interface IDispatchBody {
  orgId: string;
  kind: ScimPushEventKind;
  /** Opaque event payload that will be JSON-stringified + signed. */
  resource?: unknown;
}

@Controller('api/admin/scim-push')
@UseGuards(ScimPushGuard)
export class ScimPushController {
  private readonly logger = new Logger(ScimPushController.name);

  constructor(private readonly auth: ScimPushAuthService) {}

  @Get('subscriptions/:orgId')
  @Permissions('instance|read')
  async list(@Param('orgId') orgId: string) {
    const subs = await this.auth.listSubscriptions(orgId);
    return { orgId, total: subs.length, subscriptions: subs };
  }

  @Post('subscriptions')
  @Permissions('instance|update')
  async create(@Body() body: ICreateSubBody) {
    if (!body?.orgId || !body.endpoint || !body.signingSecret) {
      throw new BadRequestException('orgId, endpoint, signingSecret are required');
    }
    if (!body.id) {
      throw new BadRequestException('id is required for upsert (idempotent)');
    }
    const candidate = normalizeSubscription({
      id: body.id,
      orgId: body.orgId,
      label: body.label ?? '',
      endpoint: body.endpoint,
      signingSecret: body.signingSecret,
      filter: body.filter ?? [],
      enabled: body.enabled ?? true,
    });
    const errs = validateSubscription(candidate);
    if (errs.length) {
      throw new BadRequestException(`invalid subscription: ${errs.join('; ')}`);
    }
    const canRegister = await this.auth.canRegister(body.orgId);
    if (!canRegister) {
      throw new BadRequestException(
        `org ${body.orgId} has reached the SCIM push subscription limit`
      );
    }
    const saved = await this.auth.persistSubscription(candidate);
    return { subscription: saved };
  }

  @Delete('subscriptions/:id')
  @Permissions('instance|update')
  async disable(@Param('id') id: string) {
    const existing = await this.auth.loadSubscription(id);
    if (!existing) throw new NotFoundException(`subscription not found: ${id}`);
    const ok = await this.auth.disableSubscription(id);
    return { id, disabled: ok };
  }

  @Get('deliveries/:id')
  @Permissions('instance|read')
  async getDelivery(@Param('id') id: string) {
    const d = await this.auth.loadDelivery(id);
    if (!d) throw new NotFoundException(`delivery not found: ${id}`);
    return d;
  }

  @Post('dispatch')
  @Permissions('instance|update')
  async dispatch(@Body() body: IDispatchBody) {
    if (!body?.orgId || !body?.kind) {
      throw new BadRequestException('orgId and kind are required');
    }
    const payload = (body.resource && typeof body.resource === 'object'
      ? (body.resource as Record<string, unknown>)
      : {});
    const outcome = await this.auth.dispatchEvent({
      orgId: body.orgId,
      kind: body.kind,
      subjectId: typeof payload['id'] === 'string' ? (payload['id'] as string) : 'unknown',
      externalId:
        typeof payload['externalId'] === 'string' ? (payload['externalId'] as string) : null,
      payload,
    });
    return { dispatched: true, outcome };
  }
}
