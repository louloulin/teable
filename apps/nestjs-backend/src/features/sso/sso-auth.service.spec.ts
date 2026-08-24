import { SsoAuthService } from './sso-auth.service';
import { ISsoIdTokenClaims, ISsoProviderConfig } from './sso.constants';

interface MockUserService {
  findOrCreateUser: jest.Mock;
  refreshLastSignTime: jest.Mock;
}

interface MockPrisma {
  $transaction: jest.Mock;
  ssoLoginState: { update: jest.Mock };
}

const provider: ISsoProviderConfig = {
  id: 'pid_acme',
  organizationId: 'org_1',
  type: 'oidc',
  issuer: 'https://idp.acme.com',
  clientId: 'cid',
  clientSecret: 'csecret',
  discoveryUrl: null,
  emailDomain: 'acme.com',
};

const baseClaims: ISsoIdTokenClaims = {
  sub: 'user-42',
  iss: 'https://idp.acme.com',
  aud: 'cid',
  exp: Math.floor(Date.now() / 1000) + 600,
  iat: Math.floor(Date.now() / 1000),
  email: 'alice@acme.com',
  email_verified: true,
  name: 'Alice',
};

const buildPrismaMock = (): MockPrisma => {
  const stateUpdates: Array<{ id: string; data: unknown }> = [];
  return {
    $transaction: jest.fn(async (fn: (tx: MockPrisma) => Promise<unknown>) =>
      fn({ ssoLoginState: { update: jest.fn(async ({ where, data }) => {
        stateUpdates.push({ id: where.id, data });
        return { id: where.id, ...data };
      }) } } as unknown as MockPrisma)
    ),
    ssoLoginState: { update: jest.fn() },
  };
};

const buildUserServiceMock = (overrides: Partial<MockUserService> = {}): MockUserService => ({
  findOrCreateUser: jest.fn(async () => ({
    id: 'usr_alice',
    email: 'alice@acme.com',
    name: 'Alice',
    deactivatedTime: null,
  })),
  refreshLastSignTime: jest.fn(async () => undefined),
  ...overrides,
});

describe('SsoAuthService — Stage 4.1 completeCallback', () => {
  let users: MockUserService;
  let prisma: MockPrisma;
  let svc: SsoAuthService;

  const freshStateRow = () => ({
    id: 'sso_state_1',
    providerId: 'pid_acme',
    consumed: false,
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeEach(() => {
    users = buildUserServiceMock();
    prisma = buildPrismaMock();
    svc = new SsoAuthService(users as never, prisma as never);
  });

  it('returns user and marks state consumed in one transaction', async () => {
    const user = await svc.completeCallback(freshStateRow(), provider, baseClaims);
    expect(user.id).toBe('usr_alice');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // refreshLastSignTime runs after the transaction (it uses a separate tx client)
    expect(users.refreshLastSignTime).toHaveBeenCalledWith('usr_alice');
  });

  it('refuses to write a session when state was already consumed', async () => {
    const row = { ...freshStateRow(), consumed: true };
    await expect(svc.completeCallback(row, provider, baseClaims)).rejects.toThrow(
      /already consumed/
    );
    expect(users.findOrCreateUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when state is past its expiry', async () => {
    const row = { ...freshStateRow(), expiresAt: new Date(Date.now() - 1000) };
    await expect(svc.completeCallback(row, provider, baseClaims)).rejects.toThrow(
      /expired/
    );
    expect(users.findOrCreateUser).not.toHaveBeenCalled();
  });

  it('rolls back state update when user resolve fails mid-transaction', async () => {
    users.findOrCreateUser.mockRejectedValueOnce(new Error('email denied'));
    await expect(
      svc.completeCallback(freshStateRow(), provider, baseClaims)
    ).rejects.toThrow(/email denied/);
    // transaction aborted → no refresh of last-sign time
    expect(users.refreshLastSignTime).not.toHaveBeenCalled();
  });

  it('rejects when id_token email is not verified', async () => {
    await expect(
      svc.completeCallback(freshStateRow(), provider, {
        ...baseClaims,
        email_verified: false,
      })
    ).rejects.toThrow(/not verified/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when email does not match provider emailDomain', async () => {
    await expect(
      svc.completeCallback(freshStateRow(), provider, {
        ...baseClaims,
        email: 'mallory@evil.com',
      })
    ).rejects.toThrow(/does not match IdP emailDomain/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when claims.email is missing', async () => {
    await expect(
      svc.completeCallback(freshStateRow(), provider, {
        ...baseClaims,
        email: undefined,
      })
    ).rejects.toThrow(/missing email/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects deactivated accounts even after a successful transaction', async () => {
    users.findOrCreateUser.mockResolvedValueOnce({
      id: 'usr_dead',
      email: 'dead@acme.com',
      name: 'Dead',
      deactivatedTime: new Date(),
    });
    await expect(
      svc.completeCallback(freshStateRow(), provider, baseClaims)
    ).rejects.toThrow(/deactivated/);
    // transaction committed consumed=true; signin is blocked at the next layer.
    expect(users.refreshLastSignTime).not.toHaveBeenCalled();
  });
});