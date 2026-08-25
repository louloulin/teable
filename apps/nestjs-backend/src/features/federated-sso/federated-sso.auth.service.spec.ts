/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { FederatedSsoAuthService } from './federated-sso.auth.service';
import type { ISsoProvider } from './federated-sso.types';

function mkPrismaMock() {
  const ssoProviderFindMany = vi.fn();
  const prisma = {
    ssoProvider: { findMany: ssoProviderFindMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { ssoProviderFindMany } };
}

const sampleRow: Record<string, unknown> = {
  id: 'p1',
  baseId: 'b1',
  name: 'Acme',
  protocol: 'oidc',
  enabled: true,
  autoLink: true,
  emailDomains: ['acme.com'],
  priority: 100,
  config: { issuer: 'https://issuer.example.com', clientId: 'cid', clientSecret: 'c' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('FederatedSsoAuthService', () => {
  it('loads providers and resolves discovery', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.ssoProviderFindMany.mockResolvedValue([sampleRow]);
    const svc = new FederatedSsoAuthService(prisma);
    const out = await svc.discover({ baseId: 'b1', email: 'alice@acme.com' });
    expect(out.reason).toBe('matched-domain');
    expect(out.provider?.id).toBe('p1');
    expect(out.provider?.protocol).toBe('oidc');
  });
  it('returns no-match when no providers', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.ssoProviderFindMany.mockResolvedValue([]);
    const svc = new FederatedSsoAuthService(prisma);
    const out = await svc.discover({ baseId: 'b-other', email: 'x@y.com' });
    expect(out.reason).toBe('no-match');
  });
  it('delegates validate() to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new FederatedSsoAuthService(prisma);
    expect(
      svc.validate({
        id: '',
        baseId: '',
        name: '',
        protocol: 'oidc',
        enabled: true,
        priority: -1,
        config: { issuer: '', clientId: '', clientSecret: '' },
        createdAt: '',
        updatedAt: '',
      }).length
    ).toBeGreaterThan(0);
  });
  it('startSession builds an IFederatedSession', () => {
    const { prisma } = mkPrismaMock();
    const svc = new FederatedSsoAuthService(prisma);
    const provider: ISsoProvider = {
      id: 'p1',
      baseId: 'b1',
      name: 'Acme',
      protocol: 'oidc',
      enabled: true,
      priority: 100,
      config: { issuer: 'https://x', clientId: 'cid', clientSecret: 'c' },
      createdAt: '',
      updatedAt: '',
    };
    const sess = svc.startSession({
      provider,
      subject: 's1',
      email: 'a@acme.com',
      attributes: { role: 'admin' },
    });
    expect(sess.providerId).toBe('p1');
    expect(sess.subject).toBe('s1');
    expect(sess.protocol).toBe('oidc');
  });
});
