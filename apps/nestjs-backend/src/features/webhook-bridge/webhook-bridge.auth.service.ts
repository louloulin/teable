/**
 * Webhook bridge — auth layer (Stage 62).
 *
 * Persists bridge configs via Prisma and exposes a single entry point
 * that does auth + event detection + filter + dispatch.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildDispatch,
  detectEventType,
  matchesEventFilter,
  validateBridge,
  verifyInboundAuth,
} from './webhook-bridge.service';
import type { IBridgeDispatch, IInboundEnvelope, IWebhookBridge } from './webhook-bridge.types';

@Injectable()
export class WebhookBridgeAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a bridge record before persisting. */
  validate(b: IWebhookBridge): string[] {
    return validateBridge(b);
  }

  /** Load a bridge by id (internal hook for tests). */
  async loadBridge(bridgeId: string): Promise<IWebhookBridge | null> {
    const row = await this.prisma.webhookBridge.findUnique({ where: { id: bridgeId } });
    if (!row) return null;
    return toDomain(row);
  }

  /**
   * Main entry: verify + classify + filter + dispatch. Returns
   * `null` when the request should be rejected (auth or filter miss).
   */
  async handleInbound(
    bridge: IWebhookBridge,
    env: IInboundEnvelope
  ): Promise<{ dispatch: IBridgeDispatch | null; reason?: string }> {
    if (!bridge.enabled) return { dispatch: null, reason: 'bridge-disabled' };
    const authResult = verifyInboundAuth(bridge, env);
    if (!authResult.ok) return { dispatch: null, reason: authResult.reason ?? 'auth-failed' };
    const eventType = detectEventType(env);
    if (!matchesEventFilter(bridge, eventType)) {
      return { dispatch: null, reason: 'event-filter-miss' };
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(env.rawBody) as Record<string, unknown>;
    } catch {
      payload = { _raw: env.rawBody };
    }
    return {
      dispatch: buildDispatch({ bridge, env, payload }),
    };
  }
}

function toDomain(row: Record<string, unknown>): IWebhookBridge {
  const auth = (row['auth'] ?? {}) as IWebhookBridge['auth'];
  return {
    id: String(row['id']),
    baseId: String(row['baseId']),
    name: String(row['name']),
    direction: (row['direction'] ?? 'inbound') as IWebhookBridge['direction'],
    auth,
    target: (row['target'] ?? 'automation') as IWebhookBridge['target'],
    eventTypes: Array.isArray(row['eventTypes']) ? (row['eventTypes'] as string[]) : undefined,
    enabled: Boolean(row['enabled']),
    createdAt: String(row['createdAt'] ?? new Date().toISOString()),
    updatedAt: String(row['updatedAt'] ?? new Date().toISOString()),
  };
}
