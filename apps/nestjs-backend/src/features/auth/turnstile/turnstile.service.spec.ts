import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TurnstileService } from './turnstile.service';

const createService = () =>
  new TurnstileService(
    new ConfigService({
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_SITE_KEY: 'test-site',
    })
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TurnstileService', () => {
  it('returns disabled when the site is not configured', async () => {
    const service = new TurnstileService(new ConfigService({}));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(service.validateTurnstileToken('token')).resolves.toEqual({
      valid: false,
      reason: 'turnstile_disabled',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a valid Cloudflare response', async () => {
    const service = createService();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname: 'app.teable.ai' }), {
        status: 200,
      })
    );

    await expect(service.validateTurnstileToken('token')).resolves.toMatchObject({
      valid: true,
      data: { success: true, hostname: 'app.teable.ai' },
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('rejects malformed API responses', async () => {
    const service = createService();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await expect(service.validateTurnstileToken('token')).resolves.toEqual({
      valid: false,
      reason: 'invalid_response',
    });
  });

  it('returns api_error for a non-successful HTTP response', async () => {
    const service = createService();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));

    await expect(service.validateTurnstileToken('token')).resolves.toEqual({
      valid: false,
      reason: 'api_error',
    });
  });
});
