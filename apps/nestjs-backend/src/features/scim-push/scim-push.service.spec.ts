import {
  buildRequest,
  canRegisterMore,
  computeBackoff,
  isTerminal,
  normalizeSubscription,
  recordAttempt,
  shouldDeliver,
  signPayload,
  validateSubscription,
} from './scim-push.service';
import type { IScimPushDelivery, IScimPushEvent, IScimPushSubscription } from './scim-push.types';

const baseSub = (over: Partial<IScimPushSubscription> = {}): IScimPushSubscription => ({
  id: 'sub1',
  orgId: 'org1',
  label: 'Okta',
  endpoint: 'https://example.com/scim/push',
  signingSecret: 'a-very-secret-secret-12345678',
  filter: [],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseEvent = (over: Partial<IScimPushEvent> = {}): IScimPushEvent => ({
  id: 'evt1',
  orgId: 'org1',
  subscriptionId: 'sub1',
  kind: 'user.created',
  subjectId: 'u1',
  externalId: 'okta-1',
  payload: { userName: 'alice' },
  occurredAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseDelivery = (over: Partial<IScimPushDelivery> = {}): IScimPushDelivery => ({
  id: 'd1',
  eventId: 'evt1',
  subscriptionId: 'sub1',
  status: 'pending',
  attempts: 0,
  lastAttemptAt: null,
  lastStatusCode: null,
  lastError: null,
  nextRetryAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('scim-push.signPayload', () => {
  it('is deterministic', () => {
    expect(signPayload('secret', 'body')).toBe(signPayload('secret', 'body'));
  });
  it('changes when secret changes', () => {
    expect(signPayload('a', 'body')).not.toBe(signPayload('b', 'body'));
  });
});

describe('scim-push.validateSubscription', () => {
  it('passes a healthy subscription', () => {
    expect(validateSubscription(baseSub())).toEqual([]);
  });
  it('flags http endpoint', () => {
    expect(validateSubscription(baseSub({ endpoint: 'http://example.com' })).join(' ')).toContain(
      'https'
    );
  });
  it('flags short signingSecret', () => {
    expect(validateSubscription(baseSub({ signingSecret: 'short' })).join(' ')).toContain(
      'signingSecret'
    );
  });
  it('flags unknown filter kind', () => {
    expect(
      validateSubscription(
        baseSub({ filter: ['bogus.kind' as IScimPushSubscription['filter'][0]] })
      ).join(' ')
    ).toContain('unknown event kind');
  });
  it('flags missing label and orgId', () => {
    const errs = validateSubscription(baseSub({ label: '', orgId: '' }));
    expect(errs.join(' ')).toContain('label');
    expect(errs.join(' ')).toContain('orgId');
  });
});

describe('scim-push.normalizeSubscription', () => {
  it('drops unknown filter kinds', () => {
    const sub = normalizeSubscription({
      id: 's',
      orgId: 'o',
      endpoint: 'https://x',
      signingSecret: '1234567890abcdef',
      filter: ['user.created' as never, 'bogus' as never],
    });
    expect(sub.filter).toEqual(['user.created']);
    expect(sub.enabled).toBe(true);
  });
});

describe('scim-push.canRegisterMore', () => {
  it('allows under cap', () => {
    expect(canRegisterMore(7)).toBe(true);
  });
  it('blocks at cap', () => {
    expect(canRegisterMore(8)).toBe(false);
  });
});

describe('scim-push.shouldDeliver', () => {
  it('returns false when disabled', () => {
    expect(shouldDeliver(baseSub({ enabled: false }), 'user.created')).toBe(false);
  });
  it('returns true when filter is empty', () => {
    expect(shouldDeliver(baseSub(), 'group.deleted')).toBe(true);
  });
  it('returns true when filter includes the kind', () => {
    expect(shouldDeliver(baseSub({ filter: ['user.created'] }), 'user.created')).toBe(true);
  });
  it('returns false when filter excludes the kind', () => {
    expect(shouldDeliver(baseSub({ filter: ['user.deleted'] }), 'user.created')).toBe(false);
  });
});

describe('scim-push.buildRequest', () => {
  it('includes the signature header', () => {
    const r = buildRequest({ subscription: baseSub(), event: baseEvent() });
    expect(r.headers['x-scim-push-signature']).toMatch(/^sha256=/);
    expect(r.headers['content-type']).toBe('application/scim+json');
    expect(r.body).toContain('alice');
  });
});

describe('scim-push.computeBackoff', () => {
  it('retries after 5xx', () => {
    const r = computeBackoff({ attemptsSoFar: 1, lastStatusCode: 503 });
    expect(r.retry).toBe(true);
    expect(r.delayMs).toBeGreaterThan(0);
  });
  it('dead-letters after max attempts', () => {
    const r = computeBackoff({ attemptsSoFar: 5, lastStatusCode: 503 });
    expect(r.retry).toBe(false);
    expect(r.nextStatus).toBe('dead-letter');
  });
  it('dead-letters on non-retryable status', () => {
    const r = computeBackoff({ attemptsSoFar: 1, lastStatusCode: 400 });
    expect(r.nextStatus).toBe('dead-letter');
  });
  it('treats 429 as retryable', () => {
    const r = computeBackoff({ attemptsSoFar: 1, lastStatusCode: 429 });
    expect(r.retry).toBe(true);
  });
});

describe('scim-push.recordAttempt', () => {
  it('bumps attempts on retryable', () => {
    const { delivery, outcome } = recordAttempt({
      delivery: baseDelivery(),
      attempt: {
        deliveryId: 'd1',
        attemptNumber: 1,
        attemptedAt: '2026-01-01T00:00:00Z',
        statusCode: 500,
        error: null,
        durationMs: 50,
      },
    });
    expect(delivery.attempts).toBe(1);
    expect(delivery.status).toBe('failed');
    expect(outcome.deadLettered).toBe(false);
  });
  it('dead-letters after terminal 4xx', () => {
    const { outcome } = recordAttempt({
      delivery: baseDelivery(),
      attempt: {
        deliveryId: 'd1',
        attemptNumber: 1,
        attemptedAt: '2026-01-01T00:00:00Z',
        statusCode: 400,
        error: 'bad request',
        durationMs: 10,
      },
    });
    expect(outcome.deadLettered).toBe(true);
  });
  it('records network error as failed', () => {
    const { delivery } = recordAttempt({
      delivery: baseDelivery(),
      attempt: {
        deliveryId: 'd1',
        attemptNumber: 1,
        attemptedAt: '2026-01-01T00:00:00Z',
        statusCode: null,
        error: 'ECONNRESET',
        durationMs: 0,
      },
    });
    expect(delivery.attempts).toBe(1);
    expect(delivery.status).toBe('failed');
  });
});

describe('scim-push.isTerminal', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminal('delivered')).toBe(true);
    expect(isTerminal('dead-letter')).toBe(true);
    expect(isTerminal('skipped')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('failed')).toBe(false);
  });
});
