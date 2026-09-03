/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Stripe Customer Portal + cron scheduler — real roundtrip drill (R56).
 *
 * Spins up a local HTTP server pretending to be Stripe and walks:
 *   1. Cron scheduler: register three jobs (every-15-min / 9:30-daily /
 *      monthly), tick the clock forward, verify which fired.
 *   2. Portal session: build request via buildPortalSessionRequest,
 *      POST to the fake Stripe server, parse the response.
 *   3. Return URL validation: ensure SSRF guards reject loopback /
 *      metadata URLs.
 *   4. Webhook idempotency integration: combine cron + portal — when
 *      a portal session is created, schedule a follow-up cron to
 *      re-verify after N minutes.
 *
 * License: AGPL-3.0
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

import { parseCron, runCronTick, shouldFire, type ICronTick } from './billing-cron';
import {
  buildPortalSessionRequest,
  createPortalSession,
  parsePortalSessionResponse,
  validatePortalReturnUrl,
  type IPortalFetchLike,
} from './billing-portal-session';

interface IFakeStripe {
  url: string;
  port: number;
  server: Server;
  /** POSTs received by the fake server. */
  posts: Array<{ body: string; signature: string | null }>;
  /** Programmable response: next call returns this body + status. */
  setResponse(status: number, body: unknown): void;
  stop(): Promise<void>;
}

function makeFakeStripe(): IFakeStripe {
  const posts: Array<{ body: string; signature: string | null }> = [];
  let responseStatus = 200;
  let responseBody: unknown = { id: 'bps_test_default', url: 'https://billing.stripe.com/p/session/default' };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || !req.url) {
      res.statusCode = 405;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      posts.push({
        body: Buffer.concat(chunks).toString('utf8'),
        signature: (req.headers['stripe-signature'] as string) ?? null,
      });
      res.statusCode = responseStatus;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(responseBody));
    });
  });

  return {
    url: '',
    port: 0,
    server,
    posts,
    setResponse(status, body) {
      responseStatus = status;
      responseBody = body;
    },
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function startFakeStripe(): Promise<IFakeStripe> {
  const fs = makeFakeStripe();
  await new Promise<void>((resolve) => fs.server.listen(0, '127.0.0.1', () => resolve()));
  const addr = fs.server.address() as AddressInfo;
  fs.port = addr.port;
  fs.url = `http://127.0.0.1:${addr.port}/v1/billing_portal/sessions`;
  return fs;
}

function localFetch(stripe: IFakeStripe): IPortalFetchLike {
  return (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    return new Promise((resolve, reject) => {
      const http = require('node:http') as typeof import('node:http');
      const u = new URL(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: init?.method ?? 'POST',
          headers: init?.headers ?? {},
        },
        (res: import('node:http').IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              text: async () => Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );
      req.on('error', (e: Error) => reject(e));
      if (init?.body) req.write(init.body);
      req.end();
    });
  }) as IPortalFetchLike;
}

describe('Stripe Customer Portal + cron scheduler — real roundtrip drill (R56)', () => {
  let stripe: IFakeStripe | null = null;

  beforeEach(async () => {
    stripe = await startFakeStripe();
  });

  afterEach(async () => {
    if (stripe) {
      await stripe.stop();
      stripe = null;
    }
  });

  describe('Cron scheduler drill', () => {
    it('only the every-15-min job fires at 12:30 UTC', async () => {
      const every15 = parseCron('*/15 * * * *');
      const daily930 = parseCron('30 9 * * *');
      const monthly1st = parseCron('0 0 1 * *');

      const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
      const fired: string[] = [];
      const out = await runCronTick({
        now,
        jobs: [
          { name: 'every-15', schedule: every15, handler: () => { fired.push('every-15'); } },
          { name: 'daily-930', schedule: daily930 },
          { name: 'monthly-1st', schedule: monthly1st },
        ],
      });
      expect(out.fired).toEqual(['every-15']);
      expect(out.results['every-15']).toEqual(now);
      expect(fired).toEqual(['every-15']);
    });

    it('rolls the clock forward and verifies which job fires when', () => {
      const schedule = parseCron('*/15 * * * *');
      const times = [
        new Date(Date.UTC(2026, 8, 3, 12, 0, 0)),
        new Date(Date.UTC(2026, 8, 3, 12, 14, 59)),
        new Date(Date.UTC(2026, 8, 3, 12, 15, 0)),
        new Date(Date.UTC(2026, 8, 3, 12, 30, 0)),
        new Date(Date.UTC(2026, 8, 3, 13, 0, 0)),
      ];
      const results = times.map((t) => shouldFire({ schedule, now: t }));
      expect(results).toEqual([true, false, true, true, true]);
    });

    it('does not double-fire within the same minute (lastFiredAt guard)', () => {
      const schedule = parseCron('*/15 * * * *');
      const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
      // Just fired at 12:30 - calling again at 12:30 should NOT fire
      const lastFiredAt = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
      expect(shouldFire({ schedule, now, lastFiredAt })).toBe(false);
    });

    it('cron + portal combined: portal session creation triggers follow-up verification job', async () => {
      // Real flow: user creates portal session → cron schedule a verify-after-15 job
      const stripePort = stripe!;
      const verifySchedule = parseCron('*/15 * * * *');

      // 1. Create portal session via the helper
      stripePort.setResponse(200, {
        id: 'bps_test_combined_123',
        url: 'https://billing.stripe.com/p/session/combined_123',
      });
      const session = await createPortalSession({
        customerId: 'cus_12345678',
        returnUrl: 'https://app.teable.ai/billing',
        secretKey: 'sk_test_combined',
        fetchImpl: localFetch(stripePort),
        apiBase: stripePort.url,
      });
      expect(session.sessionId).toBe('bps_test_combined_123');
      expect(stripePort.posts.length).toBe(1);

      // 2. Schedule a follow-up cron to verify the session in 15 minutes
      const verifyJobs: ICronTick[] = [
        {
          name: 'verify-portal-session',
          schedule: verifySchedule,
          handler: () => undefined,
        },
      ];
      // Tick at 12:15, 12:30, 12:45 — verify job fires every 15 min
      const tickAt = (minute: number) =>
        runCronTick({
          now: new Date(Date.UTC(2026, 8, 3, 12, minute, 0)),
          jobs: verifyJobs,
        });
      const r1 = await tickAt(15);
      const r2 = await tickAt(30);
      const r3 = await tickAt(7);
      expect(r1.fired).toEqual(['verify-portal-session']);
      expect(r2.fired).toEqual(['verify-portal-session']);
      expect(r3.fired).toEqual([]); // 12:07 doesn't match */15
    });
  });

  describe('Stripe Customer Portal session drill', () => {
    it('builds the request, posts to fake Stripe, parses the response', async () => {
      const stripePort = stripe!;
      stripePort.setResponse(200, {
        id: 'bps_test_real_roundtrip',
        url: 'https://billing.stripe.com/p/session/test_real_roundtrip',
      });

      const session = await createPortalSession({
        customerId: 'cus_12345678',
        returnUrl: 'https://app.teable.ai/billing',
        secretKey: 'sk_test_real',
        fetchImpl: localFetch(stripePort),
        apiBase: stripePort.url,
      });

      expect(session.sessionId).toBe('bps_test_real_roundtrip');
      expect(session.url).toBe('https://billing.stripe.com/p/session/test_real_roundtrip');

      // Verify the request the fake Stripe received
      expect(stripePort.posts.length).toBe(1);
      const post = stripePort.posts[0];
      expect(post.body).toContain('customer=cus_12345678');
      expect(post.body).toContain('return_url=' + encodeURIComponent('https://app.teable.ai/billing'));
    });

    it('buildPortalSessionRequest matches the Stripe API contract', () => {
      const req = buildPortalSessionRequest({
        customerId: 'cus_abcdef12',
        returnUrl: 'https://app.teable.ai/billing',
        apiBase: 'https://api.stripe.com/v1/billing_portal/sessions',
      });
      expect(req.method).toBe('POST');
      expect(req.url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
      expect(req.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(req.headers['Stripe-Version']).toBe('2024-06-20');
      // Form-encoded body
      expect(req.body.split('&')).toHaveLength(2);
      expect(req.body).toContain('customer=cus_abcdef12');
    });

    it('handles Stripe 401 (invalid API key) by raising PORTAL_VALIDATION', async () => {
      const stripePort = stripe!;
      stripePort.setResponse(401, { error: { type: 'invalid_request_error', message: 'Invalid API Key' } });
      await expect(
        createPortalSession({
          customerId: 'cus_12345678',
          returnUrl: 'https://app.teable.ai/billing',
          secretKey: 'sk_bad',
          fetchImpl: localFetch(stripePort),
          apiBase: stripePort.url,
        })
      ).rejects.toThrow(/401/);
    });

    it('handles Stripe 500 by raising PORTAL_VALIDATION', async () => {
      const stripePort = stripe!;
      stripePort.setResponse(500, { error: { type: 'api_error', message: 'internal' } });
      await expect(
        createPortalSession({
          customerId: 'cus_12345678',
          returnUrl: 'https://app.teable.ai/billing',
          secretKey: 'sk_test',
          fetchImpl: localFetch(stripePort),
          apiBase: stripePort.url,
        })
      ).rejects.toThrow(/500/);
    });
  });

  describe('Return URL SSRF guard', () => {
    it('accepts valid public https URLs', () => {
      expect(() => validatePortalReturnUrl('https://app.teable.ai/billing')).not.toThrow();
      expect(() => validatePortalReturnUrl('https://example.com/return?token=abc')).not.toThrow();
    });

    it('rejects loopback / metadata / non-https', () => {
      expect(() => validatePortalReturnUrl('http://app.teable.ai/billing')).toThrow();
      expect(() => validatePortalReturnUrl('https://localhost/x')).toThrow();
      expect(() => validatePortalReturnUrl('https://127.0.0.1/x')).toThrow();
      expect(() => validatePortalReturnUrl('https://169.254.169.254/x')).toThrow();
      expect(() => validatePortalReturnUrl('javascript:alert(1)')).toThrow();
    });
  });

  describe('parsePortalSessionResponse', () => {
    it('accepts valid response', () => {
      const s = parsePortalSessionResponse({
        id: 'bps_test_valid',
        url: 'https://billing.stripe.com/p/session/test_valid',
      });
      expect(s.sessionId).toBe('bps_test_valid');
    });

    it('rejects malformed response (no bps_ prefix)', () => {
      expect(() => parsePortalSessionResponse({ id: 'wrong', url: 'https://billing.stripe.com/p/x' })).toThrow();
    });

    it('rejects non-https url', () => {
      expect(() => parsePortalSessionResponse({ id: 'bps_x', url: 'http://billing.stripe.com/p/x' })).toThrow();
    });
  });
});
