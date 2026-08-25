/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildSession,
  discoverProvider,
  emailDomain,
  oidcAuthorizeUrl,
  samlLoginUrl,
  sortProviders,
  validateOidcConfig,
  validateProvider,
  validateSamlConfig,
} from './federated-sso.service';
import type { ISsoProvider } from './federated-sso.types';

const baseProvider = (over: Partial<ISsoProvider> = {}): ISsoProvider => ({
  id: 'p1',
  baseId: 'b1',
  name: 'Acme OIDC',
  protocol: 'oidc',
  enabled: true,
  priority: 100,
  emailDomains: ['acme.com'],
  config: {
    issuer: 'https://issuer.example.com',
    clientId: 'cid',
    clientSecret: 'csecret',
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('federated-sso.emailDomain', () => {
  it('extracts the domain lowercased', () => {
    expect(emailDomain('Alice@ACME.COM')).toBe('acme.com');
  });
  it('returns empty for invalid emails', () => {
    expect(emailDomain('not-an-email')).toBe('');
  });
});

describe('federated-sso.sortProviders', () => {
  it('sorts by priority then name', () => {
    const sorted = sortProviders([
      baseProvider({ id: 'a', name: 'B', priority: 50 }),
      baseProvider({ id: 'b', name: 'A', priority: 50 }),
      baseProvider({ id: 'c', name: 'Z', priority: 10 }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('federated-sso.discoverProvider', () => {
  it('matches by email domain', () => {
    const out = discoverProvider({ baseId: 'b1', email: 'alice@acme.com' }, [
      baseProvider({ id: 'oidc', priority: 100 }),
      baseProvider({
        id: 'saml',
        name: 'Acme SAML',
        protocol: 'saml',
        priority: 50,
        config: {
          entityId: 'urn:acme',
          ssoUrl: 'https://saml.acme.com/sso',
          certificate: 'x'.repeat(200),
        },
      }),
    ]);
    expect(out.reason).toBe('matched-domain');
    expect(out.provider?.id).toBe('saml'); // lower priority number wins
  });
  it('falls back to the highest-priority enabled provider', () => {
    const out = discoverProvider({ baseId: 'b1', email: 'alice@other.com' }, [
      baseProvider({ id: 'a', emailDomains: ['first.com'] }),
      baseProvider({ id: 'b', priority: 10, emailDomains: ['second.com'] }),
    ]);
    expect(out.reason).toBe('matched-default');
    expect(out.provider?.id).toBe('b');
  });
  it('returns no-match when no providers exist for the base', () => {
    expect(discoverProvider({ baseId: 'b1', email: 'x@y.com' }, []).reason).toBe('no-match');
  });
  it('returns disabled when every provider is disabled', () => {
    expect(
      discoverProvider({ baseId: 'b1', email: 'x@y.com' }, [baseProvider({ enabled: false })])
        .reason
    ).toBe('disabled');
  });
});

describe('federated-sso validators', () => {
  it('rejects an OIDC config missing required fields', () => {
    const errs = validateOidcConfig({ issuer: '', clientId: '', clientSecret: '' });
    expect(errs).toEqual(expect.arrayContaining(['issuer is required', 'clientId is required']));
  });
  it('rejects non-http issuer', () => {
    const errs = validateOidcConfig({
      issuer: 'ftp://x',
      clientId: 'cid',
      clientSecret: 'c',
    });
    expect(errs.join(' ')).toContain('http(s)');
  });
  it('rejects a SAML config with short certificate', () => {
    const errs = validateSamlConfig({
      entityId: 'urn:x',
      ssoUrl: 'https://x',
      certificate: 'short',
    });
    expect(errs.join(' ')).toContain('too short');
  });
  it('validateProvider rejects missing fields', () => {
    expect(
      validateProvider({
        id: '',
        baseId: 'b',
        name: '',
        protocol: 'oidc',
        enabled: true,
        priority: -1,
        config: { issuer: '', clientId: '', clientSecret: '' },
        createdAt: 'x',
        updatedAt: 'x',
      }).length
    ).toBeGreaterThan(2);
  });
  it('validateProvider passes a healthy record', () => {
    expect(validateProvider(baseProvider())).toEqual([]);
  });
});

describe('federated-sso.buildSession', () => {
  it('sets issuedAt + expiresAt 8 hours later by default', () => {
    const sess = buildSession({
      provider: baseProvider(),
      subject: 's1',
      email: 'a@acme.com',
      attributes: { role: 'admin' },
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(sess.protocol).toBe('oidc');
    expect(sess.issuedAt).toBe('2026-01-01T00:00:00.000Z');
    const issuedMs = new Date(sess.issuedAt).getTime();
    const expiresMs = new Date(sess.expiresAt).getTime();
    expect(expiresMs - issuedMs).toBe(60 * 60 * 8 * 1000);
    expect(sess.attributes.role).toBe('admin');
  });
  it('honours a custom TTL', () => {
    const sess = buildSession({
      provider: baseProvider(),
      subject: 's',
      attributes: {},
      ttlSeconds: 60,
    });
    const diff = new Date(sess.expiresAt).getTime() - new Date(sess.issuedAt).getTime();
    expect(diff).toBe(60_000);
  });
});

describe('federated-sso URL builders', () => {
  it('builds an OIDC authorize URL with default scopes', () => {
    const url = oidcAuthorizeUrl(
      {
        issuer: 'https://issuer.example.com/',
        clientId: 'cid',
        clientSecret: 'csecret',
      },
      'https://app.example.com/cb',
      'state-1'
    );
    expect(url).toContain('https://issuer.example.com/authorize');
    expect(url).toContain('client_id=cid');
    expect(url).toContain('scope=openid+profile+email');
    expect(url).toContain('state=state-1');
  });
  it('builds a SAML login URL with relay state', () => {
    const url = samlLoginUrl(
      {
        entityId: 'urn:acme',
        ssoUrl: 'https://saml.example.com/sso',
        certificate: 'x'.repeat(200),
      },
      'https://app.example.com/cb'
    );
    expect(url.startsWith('https://saml.example.com/sso?')).toBe(true);
    expect(url).toContain('SAMLRequest=placeholder');
  });
});
