/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildDispatch,
  buildRoutedEvent,
  computeHmacSignature,
  detectEventType,
  matchesEventFilter,
  safeEqualHex,
  validateBridge,
  verifyInboundAuth,
} from './webhook-bridge.service';
import type { IInboundEnvelope, IWebhookBridge } from './webhook-bridge.types';

const baseBridge = (over: Partial<IWebhookBridge> = {}): IWebhookBridge => ({
  id: 'b1',
  baseId: 'base1',
  name: 'Inbound',
  direction: 'inbound',
  auth: { scheme: 'hmac-sha256', secret: 'topsecret' },
  target: 'automation',
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const envelope = (over: Partial<IInboundEnvelope> = {}): IInboundEnvelope => ({
  bridgeId: 'b1',
  rawBody: '{"type":"record.create","id":"r1"}',
  headers: { 'content-type': 'application/json' },
  receivedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('webhook-bridge.computeHmacSignature', () => {
  it('produces a deterministic hex digest', () => {
    const sig = computeHmacSignature('hello', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(computeHmacSignature('hello', 'secret')).toBe(sig);
  });
  it('differs when the secret or body changes', () => {
    const a = computeHmacSignature('hello', 'secret1');
    const b = computeHmacSignature('hello', 'secret2');
    const d = computeHmacSignature('hellp', 'secret1');
    expect(a).not.toBe(b);
    expect(a).not.toBe(d);
  });
});

describe('webhook-bridge.safeEqualHex', () => {
  it('returns true for identical hex', () => {
    expect(safeEqualHex('abcd', 'abcd')).toBe(true);
  });
  it('returns false for different lengths', () => {
    expect(safeEqualHex('ab', 'abcd')).toBe(false);
  });
  it('returns false for same length but different bytes', () => {
    expect(safeEqualHex('abcd', 'abce')).toBe(false);
  });
  it('returns true for equal-length valid hex strings', () => {
    expect(safeEqualHex('abcdef', 'abcdef')).toBe(true);
  });
  it('returns false for equal-length mismatched valid hex strings', () => {
    expect(safeEqualHex('abcdef', 'abcdee')).toBe(false);
  });
});

describe('webhook-bridge.verifyInboundAuth', () => {
  it('accepts a valid HMAC signature', () => {
    const bridge = baseBridge();
    const body = envelope();
    const sig = computeHmacSignature(body.rawBody, bridge.auth.secret ?? '');
    const env = envelope({ headers: { 'x-signature': sig, 'content-type': 'application/json' } });
    expect(verifyInboundAuth(bridge, env).ok).toBe(true);
  });
  it('rejects a tampered body', () => {
    const bridge = baseBridge();
    const sig = computeHmacSignature('original', 'topsecret');
    const env = envelope({
      rawBody: 'tampered',
      headers: { 'x-signature': sig },
    });
    expect(verifyInboundAuth(bridge, env).ok).toBe(false);
  });
  it('rejects when header is missing', () => {
    const env = envelope();
    expect(verifyInboundAuth(baseBridge(), env).ok).toBe(false);
  });
  it('rejects when secret is missing', () => {
    const bridge = baseBridge({ auth: { scheme: 'hmac-sha256' } });
    const env = envelope({ headers: { 'x-signature': 'abcd' } });
    expect(verifyInboundAuth(bridge, env).reason).toBe('missing-secret');
  });
  it('accepts a matching bearer token', () => {
    const bridge = baseBridge({ auth: { scheme: 'bearer', secret: 'abc' } });
    const env = envelope({ headers: { authorization: 'Bearer abc' } });
    expect(verifyInboundAuth(bridge, env).ok).toBe(true);
  });
  it('accepts a matching basic auth header', () => {
    const bridge = baseBridge({ auth: { scheme: 'basic', secret: 'user:pass' } });
    const expected = `basic ${Buffer.from('user:pass').toString('base64')}`;
    const env = envelope({ headers: { authorization: expected } });
    expect(verifyInboundAuth(bridge, env).ok).toBe(true);
  });
  it('always passes for scheme=none', () => {
    const bridge = baseBridge({ auth: { scheme: 'none' } });
    expect(verifyInboundAuth(bridge, envelope()).ok).toBe(true);
  });
});

describe('webhook-bridge.detectEventType', () => {
  it('uses x-event-type header when present', () => {
    expect(detectEventType(envelope({ headers: { 'x-event-type': 'order.paid' } }))).toBe(
      'order.paid'
    );
  });
  it('falls back to body.type', () => {
    expect(detectEventType(envelope({ rawBody: '{"type":"r.created"}' }))).toBe('r.created');
  });
  it('falls back to body.event', () => {
    expect(detectEventType(envelope({ rawBody: '{"event":"r.deleted"}' }))).toBe('r.deleted');
  });
  it('returns unknown when nothing matches', () => {
    expect(detectEventType(envelope({ rawBody: 'not-json' }))).toBe('unknown');
  });
});

describe('webhook-bridge.matchesEventFilter', () => {
  it('accepts when no filter configured', () => {
    expect(matchesEventFilter(baseBridge(), 'any.event')).toBe(true);
  });
  it('accepts matching event-types', () => {
    expect(matchesEventFilter(baseBridge({ eventTypes: ['a', 'b'] }), 'a')).toBe(true);
  });
  it('rejects non-matching event-types', () => {
    expect(matchesEventFilter(baseBridge({ eventTypes: ['a'] }), 'b')).toBe(false);
  });
});

describe('webhook-bridge.validateBridge', () => {
  it('passes a healthy bridge', () => {
    expect(validateBridge(baseBridge())).toEqual([]);
  });
  it('requires secret on hmac-sha256', () => {
    const errs = validateBridge(baseBridge({ auth: { scheme: 'hmac-sha256' } }));
    expect(errs.join(' ')).toContain('hmac-sha256 requires auth.secret');
  });
  it('requires secret on bearer', () => {
    const errs = validateBridge(baseBridge({ auth: { scheme: 'bearer' } }));
    expect(errs.join(' ')).toContain('bearer requires auth.secret');
  });
  it('flags missing fields', () => {
    const errs = validateBridge({
      id: '',
      baseId: '',
      name: '',
      direction: 'inbound',
      auth: { scheme: 'none' },
      target: 'automation',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    });
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('webhook-bridge.buildRoutedEvent + buildDispatch', () => {
  it('builds a routed event with parsed payload', () => {
    const bridge = baseBridge();
    const env = envelope();
    const evt = buildRoutedEvent({ bridge, env, payload: { a: 1 } });
    expect(evt.bridgeId).toBe('b1');
    expect(evt.baseId).toBe('base1');
    expect(evt.target).toBe('automation');
  });
  it('builds a dispatch with downstream target', () => {
    const bridge = baseBridge();
    const env = envelope();
    const d = buildDispatch({
      bridge,
      env,
      payload: {},
      targetUrl: 'https://example.com/cb',
      headers: { authorization: 'Bearer x' },
    });
    expect(d.downstream?.targetUrl).toBe('https://example.com/cb');
    expect(d.downstream?.headers?.authorization).toBe('Bearer x');
  });
  it('omits downstream when no targetUrl', () => {
    const bridge = baseBridge();
    const env = envelope();
    const d = buildDispatch({ bridge, env, payload: {} });
    expect(d.downstream).toBeUndefined();
  });
});
