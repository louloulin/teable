/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildAppRow,
  buildTokenRow,
  constantTimeEquals,
  foldUsage,
  generateApiToken,
  generateClientId,
  generateClientSecret,
  hashSecret,
  isTokenExpired,
  isValidChannel,
  isValidClientId,
  isValidLanguage,
  isValidOutcome,
  isValidSecretFormat,
  isValidTokenStatusTransition,
  isValidVersion,
  parseScopes,
  stringifyScopes,
  tokenHasAnyScope,
  tokenLastFour,
} from './sdk-platform.service';

describe('SDK Platform helpers (Stage 38)', () => {
  describe('validators', () => {
    it('isValidClientId accepts 12-32 uppercase alphanum', () => {
      expect(isValidClientId('ABCDEFGH1234')).toBe(true);
      expect(isValidClientId('abc')).toBe(false);
      expect(isValidClientId('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).toBe(false); // >32
    });

    it('isValidLanguage', () => {
      expect(isValidLanguage('js')).toBe(true);
      expect(isValidLanguage('python')).toBe(true);
      expect(isValidLanguage('kotlin')).toBe(false);
    });

    it('isValidChannel', () => {
      expect(isValidChannel('stable')).toBe(true);
      expect(isValidChannel('rc')).toBe(false);
    });

    it('isValidSecretFormat', () => {
      expect(isValidSecretFormat('sdk_sk_' + 'a'.repeat(32))).toBe(true);
      expect(isValidSecretFormat('sdk_sk_short')).toBe(false);
      expect(isValidSecretFormat('not_a_secret')).toBe(false);
    });

    it('isValidVersion', () => {
      expect(isValidVersion('1.2.3')).toBe(true);
      expect(isValidVersion('0.0.1-beta.1')).toBe(true);
      expect(isValidVersion('1.2')).toBe(false);
    });

    it('isValidOutcome', () => {
      expect(isValidOutcome('ok')).toBe(true);
      expect(isValidOutcome('weird')).toBe(false);
    });
  });

  describe('generators', () => {
    it('generateClientId matches regex + uppercase', () => {
      for (let i = 0; i < 5; i++) {
        const id = generateClientId();
        expect(id).toMatch(/^[0-9A-Z]+$/);
        expect(id.length).toBe(16);
      }
    });

    it('generateClientSecret matches regex', () => {
      const s = generateClientSecret();
      expect(isValidSecretFormat(s)).toBe(true);
    });

    it('generateApiToken matches tblk_<48 hex>', () => {
      const t = generateApiToken();
      expect(t).toMatch(/^tblk_[a-f0-9]{48}$/);
    });

    it('hashSecret is deterministic', () => {
      expect(hashSecret('hello')).toBe(hashSecret('hello'));
      expect(hashSecret('hello')).not.toBe(hashSecret('world'));
    });
  });

  describe('constantTimeEquals', () => {
    it('equal strings', () => {
      expect(constantTimeEquals('a', 'a')).toBe(true);
    });

    it('different length returns false', () => {
      expect(constantTimeEquals('ab', 'abc')).toBe(false);
    });

    it('same length different chars returns false', () => {
      expect(constantTimeEquals('abc', 'abd')).toBe(false);
    });
  });

  describe('scopes', () => {
    it('parseScopes handles csv', () => {
      expect(parseScopes('r,w , d')).toEqual(['r', 'w', 'd']);
    });

    it('stringifyScopes dedupes', () => {
      expect(stringifyScopes(['a', 'b', 'a', ' c '])).toBe('a,b,c');
    });

    it('tokenHasAnyScope', () => {
      expect(tokenHasAnyScope({ tokenScopesCsv: 'r,w', required: ['w', 'x'] })).toBe(true);
      expect(tokenHasAnyScope({ tokenScopesCsv: 'r,w', required: ['x'] })).toBe(false);
      expect(tokenHasAnyScope({ tokenScopesCsv: 'r,w', required: [] })).toBe(true);
    });

    it('tokenLastFour returns last 8 chars', () => {
      expect(tokenLastFour('tblk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaffff')).toMatch(
        /affff$/
      );
      expect(tokenLastFour('short').length).toBe(5);
    });
  });

  describe('rows', () => {
    it('buildAppRow sets defaults', () => {
      const r = buildAppRow({
        id: 'a',
        organizationId: 'o',
        name: 'MyApp',
        language: 'js',
        scopesCsv: 'r,w',
        createdBy: 'u',
        clientId: 'ABCDEFGH1234',
      });
      expect(r.enabled).toBe(true);
      expect(r.revokedAt).toBeNull();
    });

    it('buildTokenRow carries hash + last4', () => {
      const r = buildTokenRow({
        id: 't',
        appId: 'a',
        organizationId: 'o',
        label: 'prod',
        scopesCsv: 'r',
        createdBy: 'u',
        tokenHash: 'h',
        tokenLastFour: 'abcd',
      });
      expect(r.status).toBe('active');
      expect(r.tokenHash).toBe('h');
    });
  });

  describe('lifecycle', () => {
    it('isTokenExpired', () => {
      const past = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 1000);
      expect(isTokenExpired({ expiresAt: past })).toBe(true);
      expect(isTokenExpired({ expiresAt: future })).toBe(false);
      expect(isTokenExpired({ expiresAt: null })).toBe(false);
    });

    it('isValidTokenStatusTransition', () => {
      expect(isValidTokenStatusTransition('active', 'revoked')).toBe(true);
      expect(isValidTokenStatusTransition('expired', 'revoked')).toBe(true);
      expect(isValidTokenStatusTransition('revoked', 'active')).toBe(false);
    });
  });

  describe('foldUsage', () => {
    it('aggregates by outcome + p95 + bytes', () => {
      const agg = foldUsage([
        { appId: 'a', method: 'GET', path: '/x', statusCode: 200, durationMs: 100, outcome: 'ok' },
        {
          appId: 'a',
          method: 'GET',
          path: '/x',
          statusCode: 429,
          durationMs: 200,
          outcome: 'rate-limited',
        },
        {
          appId: 'a',
          method: 'POST',
          path: '/x',
          statusCode: 500,
          durationMs: 300,
          bytesIn: 10,
          bytesOut: 20,
          outcome: 'error',
        },
      ]);
      expect(agg.total).toBe(3);
      expect(agg.byOutcome).toEqual({ ok: 1, 'rate-limited': 1, unauthorized: 0, error: 1 });
      expect(agg.averageDurationMs).toBe(200);
      expect(agg.bytesIn).toBe(10);
      expect(agg.bytesOut).toBe(20);
      expect(agg.p95DurationMs).toBe(300);
    });

    it('empty → zero agg', () => {
      const agg = foldUsage([]);
      expect(agg.total).toBe(0);
      expect(agg.averageDurationMs).toBe(0);
      expect(agg.p95DurationMs).toBe(0);
    });
  });
});
