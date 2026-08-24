import { SsoService } from './sso.service';
import {
  ISsoIdTokenClaims,
  SSO_DISCOVERY_CACHE_TTL_MS,
  SSO_JWKS_CACHE_TTL_MS,
} from './sso.constants';
import { generateKeyPairSync } from 'crypto';

interface MockStore {
  ssoIdentityProvider: { create?: jest.Mock; findFirst?: jest.Mock; findUnique?: jest.Mock };
  ssoLoginState: { create?: jest.Mock; findUnique?: jest.Mock; update?: jest.Mock };
  organizationDomain: { findUnique?: jest.Mock };
}

const prismaMock = (): MockStore => ({
  ssoIdentityProvider: {
    create: jest.fn(async ({ data }) => ({ id: 'pid_1', ...data })),
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
  },
  ssoLoginState: {
    create: jest.fn(async ({ data }) => ({ id: `sso_${data.state}`, ...data })),
    findUnique: jest.fn(async () => null),
    update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  organizationDomain: { findUnique: jest.fn(async () => null) },
});

const domainVerificationMock = () => ({
  isSsoDomainVerified: jest.fn(async () => true),
});

describe('SsoService', () => {
  let svc: SsoService;
  let prisma: ReturnType<typeof prismaMock>;
  let dv: ReturnType<typeof domainVerificationMock>;

  beforeEach(() => {
    prisma = prismaMock();
    dv = domainVerificationMock();
    svc = new SsoService(prisma as never, dv as never);
  });

  it('refuses to register a provider for an unverified domain', async () => {
    dv.isSsoDomainVerified.mockResolvedValueOnce(false);
    await expect(
      svc.createProvider({
        organizationId: 'org_1',
        name: 'Acme IdP',
        issuer: 'https://idp.example.com',
        clientId: 'cid',
        clientSecret: 'csecret',
        emailDomain: 'acme.com',
        createdBy: 'u1',
      })
    ).rejects.toThrow(/must be verified first/);
  });

  it('round-trips discovery with TTL cache', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            issuer: 'https://idp.example.com',
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'https://idp.example.com/token',
            jwks_uri: 'https://idp.example.com/jwks',
          }),
          { status: 200 }
        )
      );
    const first = await svc.fetchDiscovery('https://idp.example.com');
    const second = await svc.fetchDiscovery('https://idp.example.com');
    expect(first).toBe(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('cache expires after the configured TTL', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          issuer: 'https://idp.example.com',
          authorization_endpoint: 'https://idp.example.com/auth',
          token_endpoint: 'https://idp.example.com/token',
          jwks_uri: 'https://idp.example.com/jwks',
        }),
        { status: 200 }
      )
    );
    await svc.fetchDiscovery('https://idp.example.com');
    // Force expiry by reading the cache and rewinding the timestamp.
    const cache = (svc as unknown as { discoveryCache: Map<string, { expiresAt: number }> })
      .discoveryCache;
    const entry = cache.get('https://idp.example.com');
    entry!.expiresAt = Date.now() - 1;
    await svc.fetchDiscovery('https://idp.example.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Sanity check that TTL is what we expect — guards against silent drift.
    expect(SSO_DISCOVERY_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    expect(SSO_JWKS_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    fetchSpy.mockRestore();
  });

  it('verifyIdToken rejects when iss mismatches', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const header = { alg: 'RS256', kid: 'k1', typ: 'JWT' };
    const claims: ISsoIdTokenClaims = {
      sub: 'user-1',
      iss: 'https://evil.example.com',
      aud: 'cid',
      exp: Math.floor(Date.now() / 1000) + 60,
      iat: Math.floor(Date.now() / 1000),
      email: 'u@acme.com',
    };
    const enc = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${enc(header)}.${enc(claims)}`;
    const sign = (require('crypto') as typeof import('crypto')).createSign('RSA-SHA256');
    sign.update(signingInput);
    sign.end();
    const signature = sign.sign(privateKey).toString('base64url');
    const jwt = `${signingInput}.${signature}`;
    await expect(svc.verifyIdToken(jwt, 'https://idp.example.com', 'cid')).rejects.toThrow(
      /iss mismatch/
    );
  });
});