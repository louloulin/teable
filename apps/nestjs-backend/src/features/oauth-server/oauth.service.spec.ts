import { OAuthService } from './oauth.service';
import { vi } from 'vitest';
import { createHash } from 'crypto';

interface MockStore {
  oauthApplication: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  oauthAuthorizationCode: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  oauthAccessToken: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  oauthApplication: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
  },
  oauthAuthorizationCode: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async () => undefined),
  },
  oauthAccessToken: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async () => undefined),
  },
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('OAuthService (Stage 16)', () => {
  let svc: OAuthService;
  let store: MockStore;

  beforeEach(() => {
    store = buildPrisma();
    svc = new OAuthService(store as never);
  });

  it('createApplication stores only the scrypt hash of the secret', async () => {
    const result = await svc.createApplication({
      name: 'test app',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
    });
    expect(result.clientSecret).toMatch(/^secret_/);
    expect(result.application.clientSecretHash).toMatch(/^scrypt\$[a-f0-9]+$/);
    expect(result.application.clientSecretHash).not.toContain(result.clientSecret);
  });

  it('issueAuthorizationCode stores only the sha256 hash', async () => {
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    const { code } = await svc.issueAuthorizationCode({
      request: {
        clientId: 'cli_1',
        redirectUri: 'https://example.com/cb',
        responseType: 'code',
        state: 'xyz',
      },
      userId: 'u1',
    });
    expect(code).toBeTruthy();
    expect(store.oauthAuthorizationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codeHash: sha256(code),
          applicationId: 'app_1',
          userId: 'u1',
        }),
      })
    );
  });

  it('issueAuthorizationCode rejects unregistered redirect_uri', async () => {
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    await expect(
      svc.issueAuthorizationCode({
        request: {
          clientId: 'cli_1',
          redirectUri: 'https://evil.com/cb',
          responseType: 'code',
        },
        userId: 'u1',
      })
    ).rejects.toThrow(/redirect_uri not registered/);
  });

  it('issueAuthorizationCode rejects plain PKCE method', async () => {
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    await expect(
      svc.issueAuthorizationCode({
        request: {
          clientId: 'cli_1',
          redirectUri: 'https://example.com/cb',
          responseType: 'code',
          codeChallenge: 'whatever',
          codeChallengeMethod: 'plain',
        },
        userId: 'u1',
      })
    ).rejects.toThrow(/S256/);
  });

  it('exchangeToken: authorization_code happy path with PKCE', async () => {
    const verifier = 'verifier_' + 'x'.repeat(40);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read', 'write'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    store.oauthAuthorizationCode.findFirst.mockResolvedValueOnce({
      id: 'ac_1',
      applicationId: 'app_1',
      userId: 'u1',
      redirectUri: 'https://example.com/cb',
      scope: 'read write',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const code = 'the_code';
    store.oauthAuthorizationCode.findFirst.mockResolvedValueOnce({
      id: 'ac_1',
      applicationId: 'app_1',
      userId: 'u1',
      redirectUri: 'https://example.com/cb',
      scope: 'read write',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const resp = await svc.exchangeToken({
      request: {
        grantType: 'authorization_code',
        code,
        redirectUri: 'https://example.com/cb',
        clientId: 'cli_1',
        codeVerifier: verifier,
      },
    });
    expect(resp.accessToken).toBeTruthy();
    expect(resp.refreshToken).toBeTruthy();
    expect(resp.scope).toBe('read write');
    expect(store.oauthAuthorizationCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ac_1' },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      })
    );
  });

  it('exchangeToken: rejects code_verifier mismatch', async () => {
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    store.oauthAuthorizationCode.findFirst.mockResolvedValueOnce({
      id: 'ac_1',
      applicationId: 'app_1',
      userId: 'u1',
      redirectUri: 'https://example.com/cb',
      scope: 'read',
      codeChallenge: 'expected_challenge',
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    await expect(
      svc.exchangeToken({
        request: {
          grantType: 'authorization_code',
          code: 'c',
          redirectUri: 'https://example.com/cb',
          clientId: 'cli_1',
          codeVerifier: 'wrong_verifier',
        },
      })
    ).rejects.toThrow(/code_verifier mismatch/);
  });

  it('exchangeToken: rejects already-consumed code', async () => {
    store.oauthApplication.findFirst.mockResolvedValueOnce({
      id: 'app_1',
      clientId: 'cli_1',
      clientSecretHash: 'scrypt$x',
      name: 'a',
      redirectUris: ['https://example.com/cb'],
      scopes: ['read'],
      createdBy: 'u1',
      createdTime: new Date(),
    });
    store.oauthAuthorizationCode.findFirst.mockResolvedValueOnce({
      id: 'ac_1',
      applicationId: 'app_1',
      userId: 'u1',
      redirectUri: 'https://example.com/cb',
      scope: 'read',
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    await expect(
      svc.exchangeToken({
        request: {
          grantType: 'authorization_code',
          code: 'c',
          redirectUri: 'https://example.com/cb',
          clientId: 'cli_1',
        },
      })
    ).rejects.toThrow(/already consumed/);
  });

  it('resolveAccessToken returns null for unknown token', async () => {
    const r = await svc.resolveAccessToken('whatever');
    expect(r).toBeNull();
  });

  it('resolveAccessToken returns userId+scope for a fresh token', async () => {
    const raw = 'the_access_token';
    const tokenHash = sha256(raw);
    store.oauthAccessToken.findFirst.mockResolvedValueOnce({
      id: 'tk_1',
      userId: 'u42',
      scope: 'read write',
      applicationId: 'app_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const r = await svc.resolveAccessToken(raw);
    expect(r).toEqual({ userId: 'u42', scope: 'read write' });
    expect(store.oauthAccessToken.findFirst).toHaveBeenCalledWith({
      where: { tokenHash },
    });
  });

  it('resolveAccessToken returns null for revoked tokens', async () => {
    store.oauthAccessToken.findFirst.mockResolvedValueOnce({
      id: 'tk_1',
      userId: 'u1',
      scope: 'read',
      applicationId: 'app_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });
    const r = await svc.resolveAccessToken('t');
    expect(r).toBeNull();
  });

  it('revokeAccessToken marks the token revoked', async () => {
    const raw = 't';
    store.oauthAccessToken.findFirst.mockResolvedValueOnce({
      id: 'tk_1',
      userId: 'u1',
      scope: 'read',
      applicationId: 'app_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const ok = await svc.revokeAccessToken(raw);
    expect(ok).toBe(true);
    expect(store.oauthAccessToken.update).toHaveBeenCalledWith({
      where: { id: 'tk_1' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
