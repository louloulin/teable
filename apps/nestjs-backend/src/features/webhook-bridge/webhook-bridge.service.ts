/**
 * Webhook bridge — pure helpers (Stage 62).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  IAuthResult,
  IBridgeAuthConfig,
  IBridgeDispatch,
  IInboundEnvelope,
  IRoutedEvent,
  IWebhookBridge,
} from './webhook-bridge.types';

/** Compute an HMAC-SHA256 signature over `body` using `secret`. */
export function computeHmacSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex signatures. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify an inbound envelope against the bridge's auth config. Returns
 * `ok:true` on success, otherwise an `AuthFailureReason`.
 */
export function verifyInboundAuth(bridge: IWebhookBridge, env: IInboundEnvelope): IAuthResult {
  const auth = bridge.auth;
  switch (auth.scheme) {
    case 'none':
      return { ok: true };
    case 'hmac-sha256':
      return verifyHmac(auth, env);
    case 'bearer': {
      if (!auth.secret) return fail('missing-secret');
      const headerName = (auth.headerName ?? 'authorization').toLowerCase();
      const got = env.headers[headerName] ?? '';
      const token = got.toLowerCase().startsWith('bearer ') ? got.slice(7) : got;
      return token === auth.secret ? { ok: true } : fail('bad-signature');
    }
    case 'basic': {
      if (!auth.secret) return fail('missing-secret');
      const headerName = (auth.headerName ?? 'authorization').toLowerCase();
      const got = env.headers[headerName] ?? '';
      const expected = `basic ${Buffer.from(auth.secret).toString('base64')}`;
      return got === expected ? { ok: true } : fail('bad-signature');
    }
    default:
      return fail('unknown-scheme');
  }
}

function verifyHmac(auth: IBridgeAuthConfig, env: IInboundEnvelope): IAuthResult {
  if (!auth.secret) return fail('missing-secret');
  const headerName = (auth.headerName ?? 'x-signature').toLowerCase();
  const sig = env.headers[headerName];
  if (!sig) return fail('missing-header');
  const expected = computeHmacSignature(env.rawBody, auth.secret);
  return safeEqualHex(sig, expected) ? { ok: true } : fail('bad-signature');
}

function fail(reason: IAuthResult['reason']): IAuthResult {
  return { ok: false, reason };
}

/**
 * Decide which event type an inbound request represents. Stage 62 keeps
 * this simple — the bridge owner is responsible for tagging events
 * either via header (`x-event-type`) or via the body's `type` field.
 */
export function detectEventType(env: IInboundEnvelope): string {
  const headerType = env.headers['x-event-type'];
  if (headerType) return headerType;
  try {
    const parsed = JSON.parse(env.rawBody) as { type?: unknown; event?: unknown };
    if (typeof parsed.type === 'string') return parsed.type;
    if (typeof parsed.event === 'string') return parsed.event;
  } catch {
    // ignore — caller decides what to do when no event type can be detected
  }
  return 'unknown';
}

/** Apply the bridge's event-type filter. */
export function matchesEventFilter(bridge: IWebhookBridge, eventType: string): boolean {
  if (!bridge.eventTypes || bridge.eventTypes.length === 0) return true;
  return bridge.eventTypes.includes(eventType);
}

/** Validate a bridge record before persisting. */
export function validateBridge(bridge: IWebhookBridge): string[] {
  const errs: string[] = [];
  if (!bridge.id) errs.push('id is required');
  if (!bridge.baseId) errs.push('baseId is required');
  if (!bridge.name) errs.push('name is required');
  if (bridge.direction === 'inbound' || bridge.direction === 'both') {
    if (bridge.auth.scheme === 'hmac-sha256' && !bridge.auth.secret) {
      errs.push('hmac-sha256 requires auth.secret');
    }
    if (bridge.auth.scheme === 'bearer' && !bridge.auth.secret) {
      errs.push('bearer requires auth.secret');
    }
  }
  return errs;
}

/** Build the routed event descriptor (the in-process message). */
export function buildRoutedEvent(args: {
  bridge: IWebhookBridge;
  env: IInboundEnvelope;
  payload: Record<string, unknown>;
}): IRoutedEvent {
  return {
    id: `evt_${args.env.receivedAt}_${args.bridge.id}`,
    bridgeId: args.bridge.id,
    baseId: args.bridge.baseId,
    eventType: detectEventType(args.env),
    payload: args.payload,
    target: args.bridge.target,
    receivedAt: args.env.receivedAt,
  };
}

/** Wrap a routed event into a dispatch for automation / webhook-delivery. */
export function buildDispatch(args: {
  bridge: IWebhookBridge;
  env: IInboundEnvelope;
  payload: Record<string, unknown>;
  targetUrl?: string;
  headers?: Record<string, string>;
}): IBridgeDispatch {
  const envelope = buildRoutedEvent(args);
  const out: IBridgeDispatch = { envelope };
  if (args.targetUrl) {
    out.downstream = {
      targetUrl: args.targetUrl,
      ...(args.headers ? { headers: args.headers } : {}),
    };
  }
  return out;
}
