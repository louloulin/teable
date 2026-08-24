import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { promises as dns } from 'dns';
import { PrismaService } from '@teable/db-main-prisma';

import { DomainVerificationService } from './domain-verification.service';

class FakeDomainStore {
  rows = new Map<string, { id: string; domain: string; verificationToken: string; organizationId: string; status: string; ssoBound: boolean; boundAppId: string | null; lastError: string | null; createdBy: string }>();

  findUnique = jest.fn(async ({ where }: { where: { domain: string } }) => {
    return this.rows.get(where.domain) ?? null;
  });
  upsert = jest.fn(async ({ where, create }: { where: { domain: string }; create: { domain: string; organizationId: string; verificationToken: string; createdBy: string } }) => {
    const existing = this.rows.get(where.domain);
    if (existing) return existing;
    const row = { id: `id-${this.rows.size}`, ...create, status: 'pending', ssoBound: false, boundAppId: null, lastError: null };
    this.rows.set(create.domain, row);
    return row;
  });
  update = jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    for (const r of this.rows.values()) {
      if (r.id === where.id) {
        Object.assign(r, data);
        return r;
      }
    }
    throw new Error('not found');
  });
}

describe('DomainVerificationService', () => {
  let service: DomainVerificationService;
  let store: FakeDomainStore;

  beforeEach(async () => {
    store = new FakeDomainStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainVerificationService,
        { provide: PrismaService, useValue: { organizationDomain: store } },
      ],
    }).compile();
    service = module.get(DomainVerificationService);
  });

  it('rejects malformed domains', async () => {
    await expect(service.claim('org1', 'not a domain', 'u1')).rejects.toThrow();
    await expect(service.claim('org1', '', 'u1')).rejects.toThrow();
    await expect(service.claim('org1', '-bad-.com', 'u1')).rejects.toThrow();
  });

  it('issues a verification token on claim', async () => {
    const row = await service.claim('org1', 'acme.com', 'u1');
    expect(row.verificationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(row.status).toBe('pending');
  });

  it('refuses binding on an unverified domain', async () => {
    await service.claim('org1', 'acme.com', 'u1');
    await expect(service.bindSso('org1', 'acme.com', true)).rejects.toThrow();
  });

  it('flags verified domains for SSO binding', async () => {
    const claim = await service.claim('org1', 'acme.com', 'u1');
    // Manually promote to verified for the bind test.
    store.update.mockClear();
    await store.update({
      where: { id: claim.id },
      data: { status: 'verified', lastError: null },
    });
    const bound = await service.bindSso('org1', 'acme.com', true);
    expect(bound.ssoBound).toBe(true);
  });

  it('isSsoDomainVerified only returns true for verified+bound domains', async () => {
    await service.claim('org1', 'acme.com', 'u1');
    expect(await service.isSsoDomainVerified('alice@acme.com')).toBe(false);
    await store.update({
      where: { id: (await service.list('org1'))[0].id },
      data: { status: 'verified' },
    });
    await service.bindSso('org1', 'acme.com', true);
    expect(await service.isSsoDomainVerified('alice@acme.com')).toBe(true);
  });

  it('treats DNS ENOTFOUND as transient (keeps pending)', async () => {
    const claim = await service.claim('org1', 'acme.com', 'u1');
    const spy = jest.spyOn(dns, 'resolveTxt').mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
    );
    const result = await service.verify('org1', 'acme.com');
    expect(result.transient).toBe(true);
    expect(result.ok).toBe(false);
    const after = store.rows.get('acme.com')!;
    expect(after.status).toBe('pending');
    expect(after.lastError).toBeNull();
    spy.mockRestore();
  });
});