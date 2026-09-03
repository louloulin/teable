/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import {
  PortalValidationError,
  buildPortalSessionRequest,
  createPortalSession,
  parsePortalSessionResponse,
  validateCustomerId,
  validatePortalReturnUrl,
} from './billing-portal-session';

describe('billing-portal-session.validateCustomerId', () => {
  it('accepts well-formed cus_* ids', () => {
    expect(() => validateCustomerId('cus_12345678')).not.toThrow();
    expect(() => validateCustomerId('cus_aBcDeFgHiJkLmNo1234567890')).not.toThrow();
  });

  it('rejects empty / non-string', () => {
    expect(() => validateCustomerId('')).toThrow(PortalValidationError);
    expect(() => validateCustomerId(null as never)).toThrow(PortalValidationError);
  });

  it('rejects malformed ids (wrong prefix / too short)', () => {
    expect(() => validateCustomerId('cus_short')).toThrow(PortalValidationError);
    expect(() => validateCustomerId('cus_!!!invalid')).toThrow(PortalValidationError);
    expect(() => validateCustomerId('cus_invalid@chars')).toThrow(PortalValidationError);
    expect(() => validateCustomerId('not_a_cus_id')).toThrow(PortalValidationError);
  });
});

describe('billing-portal-session.validatePortalReturnUrl', () => {
  it('accepts https URLs', () => {
    const url = validatePortalReturnUrl('https://app.teable.ai/billing');
    expect(url.hostname).toBe('app.teable.ai');
  });

  it('rejects non-https schemes', () => {
    expect(() => validatePortalReturnUrl('http://app.teable.ai/billing')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('javascript:alert(1)')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('file:///etc/passwd')).toThrow(PortalValidationError);
  });

  it('rejects loopback / metadata hosts (SSRF guard)', () => {
    expect(() => validatePortalReturnUrl('https://localhost/x')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('https://127.0.0.1/x')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('https://169.254.169.254/latest/meta-data')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('https://metadata.google.internal/')).toThrow(PortalValidationError);
  });

  it('rejects malformed URLs', () => {
    expect(() => validatePortalReturnUrl('not a url')).toThrow(PortalValidationError);
    expect(() => validatePortalReturnUrl('')).toThrow(PortalValidationError);
  });
});

describe('billing-portal-session.buildPortalSessionRequest', () => {
  it('builds a POST to the Stripe portal endpoint with form-encoded body', () => {
    const req = buildPortalSessionRequest({
      customerId: 'cus_12345678',
      returnUrl: 'https://app.teable.ai/billing',
    });
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(req.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(req.headers['Stripe-Version']).toBe('2024-06-20');
    expect(req.body).toContain('customer=cus_12345678');
    expect(req.body).toContain('return_url=' + encodeURIComponent('https://app.teable.ai/billing'));
  });

  it('respects apiBase override (for testing)', () => {
    const req = buildPortalSessionRequest({
      customerId: 'cus_12345678',
      returnUrl: 'https://app.teable.ai/billing',
      apiBase: 'http://127.0.0.1:9999/v1/billing_portal/sessions',
    });
    expect(req.url).toBe('http://127.0.0.1:9999/v1/billing_portal/sessions');
  });

  it('throws PortalValidationError when returnUrl is unsafe', () => {
    expect(() =>
      buildPortalSessionRequest({
        customerId: 'cus_12345678',
        returnUrl: 'http://localhost:3000/x',
      })
    ).toThrow(PortalValidationError);
  });
});

describe('billing-portal-session.parsePortalSessionResponse', () => {
  it('parses a valid Stripe response', () => {
    const session = parsePortalSessionResponse({
      id: 'bps_test_1234abcd',
      url: 'https://billing.stripe.com/p/session/test_1234abcd',
    });
    expect(session.sessionId).toBe('bps_test_1234abcd');
    expect(session.url).toBe('https://billing.stripe.com/p/session/test_1234abcd');
  });

  it('rejects response without bps_* id', () => {
    expect(() =>
      parsePortalSessionResponse({ id: 'wrong_prefix', url: 'https://billing.stripe.com/p/x' })
    ).toThrow(PortalValidationError);
  });

  it('rejects response with non-https url', () => {
    expect(() =>
      parsePortalSessionResponse({ id: 'bps_x', url: 'http://billing.stripe.com/p/x' })
    ).toThrow(PortalValidationError);
  });

  it('rejects non-object input', () => {
    expect(() => parsePortalSessionResponse(null)).toThrow(PortalValidationError);
    expect(() => parsePortalSessionResponse('string')).toThrow(PortalValidationError);
  });
});

describe('billing-portal-session.createPortalSession (end-to-end)', () => {
  it('calls the injected fetchImpl with bearer auth and parses the response', async () => {
    let captured: { url: string; method: string; headers: Record<string, string>; body: string } | null = null;
    const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      captured = { url, method: init?.method ?? '', headers: init?.headers ?? {}, body: init?.body ?? '' };
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'bps_test_abc',
            url: 'https://billing.stripe.com/p/session/test_abc',
          }),
      };
    };
    const session = await createPortalSession({
      customerId: 'cus_12345678',
      returnUrl: 'https://app.teable.ai/billing',
      secretKey: 'sk_test_xyz',
      fetchImpl,
      apiBase: 'https://stripe.test/v1/billing_portal/sessions',
    });
    expect(session.sessionId).toBe('bps_test_abc');
    expect(session.url).toBe('https://billing.stripe.com/p/session/test_abc');
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://stripe.test/v1/billing_portal/sessions');
    expect(captured!.method).toBe('POST');
    expect(captured!.headers['Authorization']).toBe('Bearer sk_test_xyz');
  });

  it('throws on non-2xx Stripe response (PORTAL_VALIDATION)', async () => {
    const fetchImpl = async () => ({
      status: 401,
      text: async () => 'invalid api key',
    });
    await expect(
      createPortalSession({
        customerId: 'cus_12345678',
        returnUrl: 'https://app.teable.ai/billing',
        secretKey: 'sk_bad',
        fetchImpl,
        apiBase: 'https://stripe.test/v1/billing_portal/sessions',
      })
    ).rejects.toThrow(/401/);
  });

  it('throws on non-JSON response', async () => {
    const fetchImpl = async () => ({
      status: 200,
      text: async () => '<html>not json</html>',
    });
    await expect(
      createPortalSession({
        customerId: 'cus_12345678',
        returnUrl: 'https://app.teable.ai/billing',
        secretKey: 'sk_test_xyz',
        fetchImpl,
      })
    ).rejects.toThrow(/not JSON/);
  });
});
