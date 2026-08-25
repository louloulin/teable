/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyInstallUpdate,
  buildCatchHookUrl,
  buildInstallRow,
  generateWebhookSecret,
  hashPayload,
  isDuplicateDelivery,
  isValidInstallStatusTransition,
  isValidProviderCode,
  resolveBundledProvider,
  resolveProvider,
  signCatchHook,
  verifyCatchHookSignature,
} from './integration-connector.service';

describe('Integration Connector helpers (Stage 33)', () => {
  describe('isValidProviderCode / resolveBundledProvider', () => {
    it('accepts slug codes', () => {
      expect(isValidProviderCode('zapier')).toBe(true);
      expect(isValidProviderCode('google-sheets')).toBe(true);
      expect(isValidProviderCode('Zapier')).toBe(false);
      expect(isValidProviderCode('-bad')).toBe(false);
    });

    it('finds known bundled providers', () => {
      expect(resolveBundledProvider('zapier')?.displayName).toBe('Zapier');
      expect(resolveBundledProvider('nope')).toBeNull();
    });
  });

  describe('catch-hook signing', () => {
    it('round-trips a valid signature', () => {
      const secret = 'whsec_x';
      const payload = '{"event":"row.created"}';
      const t = 1_700_000_000;
      const sig = signCatchHook({ secret, payload, timestamp: t });
      expect(verifyCatchHookSignature({ header: sig, secret, payload, now: t }).valid).toBe(true);
    });

    it('rejects missing header', () => {
      const r = verifyCatchHookSignature({ header: null, secret: 's', payload: '{}' });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('missing');
    });

    it('rejects malformed header', () => {
      expect(verifyCatchHookSignature({ header: 'foo', secret: 's', payload: '{}' }).reason).toBe(
        'malformed'
      );
    });

    it('rejects stale timestamps', () => {
      const sig = signCatchHook({ secret: 's', payload: '{}', timestamp: 1_000_000 });
      const r = verifyCatchHookSignature({
        header: sig,
        secret: 's',
        payload: '{}',
        now: 2_000_000,
      });
      expect(r.reason).toBe('too-old');
    });

    it('rejects wrong secret', () => {
      const sig = signCatchHook({ secret: 'a', payload: '{}', timestamp: 1_700_000_000 });
      const r = verifyCatchHookSignature({
        header: sig,
        secret: 'b',
        payload: '{}',
        now: 1_700_000_000,
      });
      expect(r.reason).toBe('mismatch');
    });
  });

  describe('hashPayload / generateWebhookSecret', () => {
    it('hashPayload is stable + hex 64', () => {
      const a = hashPayload({ x: 1 });
      const b = hashPayload({ x: 1 });
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generateWebhookSecret matches whsec_<48 hex>', () => {
      const s = generateWebhookSecret();
      expect(s).toMatch(/^whsec_[a-f0-9]{48}$/);
    });
  });

  describe('install state machine + rows', () => {
    it('allows valid transitions', () => {
      expect(isValidInstallStatusTransition('pending', 'active')).toBe(true);
      expect(isValidInstallStatusTransition('active', 'revoked')).toBe(true);
      expect(isValidInstallStatusTransition('expired', 'active')).toBe(true);
    });

    it('blocks invalid transitions', () => {
      expect(isValidInstallStatusTransition('revoked', 'active')).toBe(false);
      expect(isValidInstallStatusTransition('pending', 'expired')).toBe(false);
    });

    it('buildInstallRow defaults status to active', () => {
      const r = buildInstallRow({
        id: 'i',
        organizationId: 'o',
        providerCode: 'zapier',
        installedBy: 'u',
      });
      expect(r.status).toBe('active');
      expect(r.webhookSecret).toBeNull();
    });

    it('buildInstallRow carries webhookSecret when provided', () => {
      const r = buildInstallRow({
        id: 'i',
        organizationId: 'o',
        providerCode: 'zapier',
        installedBy: 'u',
        webhookSecret: 'whsec_x',
      });
      expect(r.webhookSecret).toBe('whsec_x');
    });

    it('applyInstallUpdate preserves fields not in update', () => {
      const row = {
        status: 'active' as const,
        accessTokenJson: null,
        refreshToken: null,
        scopesCsv: 'r,w',
        expiresAt: null,
        externalAccountId: null,
        revokedAt: null,
      };
      const merged = applyInstallUpdate(row, { accessTokenJson: 'tok' });
      expect(merged.scopesCsv).toBe('r,w');
      expect(merged.accessTokenJson).toBe('tok');
    });
  });

  describe('buildCatchHookUrl', () => {
    it('strips trailing slash', () => {
      expect(buildCatchHookUrl({ baseUrl: 'https://x.example/', installId: 'inst_1' })).toBe(
        'https://x.example/api/integrations/catch-hook/inst_1'
      );
    });

    it('keeps clean base', () => {
      expect(buildCatchHookUrl({ baseUrl: 'https://x.example', installId: 'inst_1' })).toContain(
        '/api/integrations/catch-hook/inst_1'
      );
    });
  });

  describe('isDuplicateDelivery', () => {
    it('flags hash in seen set', () => {
      const seen = new Set(['h1']);
      expect(isDuplicateDelivery({ seen, payloadHash: 'h1' })).toBe(true);
      expect(isDuplicateDelivery({ seen, payloadHash: 'h2' })).toBe(false);
    });

    it('flags hash within window', () => {
      const seen = new Set<string>();
      expect(
        isDuplicateDelivery({
          seen,
          payloadHash: 'h1',
          lastSeenAt: 100,
          now: 130,
          windowMs: 60_000,
        })
      ).toBe(true);
      expect(
        isDuplicateDelivery({
          seen,
          payloadHash: 'h1',
          lastSeenAt: 100,
          now: 200_000,
          windowMs: 60_000,
        })
      ).toBe(false);
    });
  });

  describe('resolveProvider', () => {
    it('returns registered when present', () => {
      const p = resolveProvider({
        code: 'zapier',
        registered: {
          id: 'p1',
          code: 'zapier',
          displayName: 'Z',
          category: 'automation',
          authType: 'webhook-only',
          webhookStyle: 'catch-hook',
          description: null,
          docsUrl: null,
          enabled: true,
          createdTime: new Date(),
        },
      });
      expect(p?.id).toBe('p1');
    });

    it('falls back to bundled catalog', () => {
      const p = resolveProvider({ code: 'zapier', registered: null });
      expect(p?.code).toBe('zapier');
    });

    it('returns null when neither knows the code', () => {
      expect(resolveProvider({ code: 'not-a-provider', registered: null })).toBeNull();
    });
  });
});
