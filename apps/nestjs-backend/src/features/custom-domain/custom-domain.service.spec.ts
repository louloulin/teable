import { Test } from '@nestjs/testing';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';

import { CustomHttpException } from '../../custom.exception';
import { CustomDomainService } from './custom-domain.service';

class FakeDomainStore {
  rows = new Map<
    string,
    {
      id: string;
      domain: string;
      verificationToken: string;
      organizationId: string;
      status: string;
      createdBy: string;
      lastError: string | null;
    }
  >();

  findUnique = jest.fn(async ({ where }: { where: { domain: string } }) => {
    return this.rows.get(where.domain) ?? null;
  });
  upsert = jest.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { domain: string };
      create: {
        organizationId: string;
        domain: string;
        verificationToken: string;
        createdBy: string;
        status: string;
      };
      update: { verificationToken: string; status: string; lastError: null };
    }) => {
      const existing = this.rows.get(where.domain);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = {
        id: `id-${this.rows.size}`,
        ...create,
        lastError: null,
      };
      this.rows.set(create.domain, row);
      return row;
    }
  );
}

describe('CustomDomainService', () => {
  let service: CustomDomainService;
  let store: FakeDomainStore;
  const originalEnv = process.env.TEABLE_LB_DNS_NAME;

  beforeEach(async () => {
    store = new FakeDomainStore();
    delete process.env.TEABLE_LB_DNS_NAME;
    const module = await Test.createTestingModule({
      providers: [CustomDomainService, { provide: PrismaService, useValue: { organizationDomain: store } }],
    }).compile();
    service = module.get(CustomDomainService);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TEABLE_LB_DNS_NAME;
    } else {
      process.env.TEABLE_LB_DNS_NAME = originalEnv;
    }
  });

  it('returns verified=false and default cnameTarget when no row exists', async () => {
    const out = await service.checkDomain('acme.com');
    expect(out).toEqual({ cnameTarget: 'lb.teable.cloud', verified: false });
  });

  it('honors TEABLE_LB_DNS_NAME override in checkDomain', async () => {
    process.env.TEABLE_LB_DNS_NAME = '  lb.tenant.example  ';
    const out = await service.checkDomain('acme.com');
    expect(out.cnameTarget).toBe('lb.tenant.example');
    expect(out.verified).toBe(false);
  });

  it('reports verified=true once an OrganizationDomain row reaches verified status', async () => {
    store.rows.set('acme.com', {
      id: 'id-0',
      domain: 'acme.com',
      verificationToken: 'tok',
      organizationId: 'org_1',
      status: 'pending',
      createdBy: 'u1',
      lastError: null,
    });
    const out = await service.checkDomain('acme.com');
    expect(out.verified).toBe(false);
    store.rows.get('acme.com')!.status = 'verified';
    const out2 = await service.checkDomain('acme.com');
    expect(out2.verified).toBe(true);
    expect(out2.cnameTarget).toBe('lb.teable.cloud');
  });

  it('creates an OrganizationDomain row on claimDomain', async () => {
    const row = await service.claimDomain('acme.com', 'org_1', 'u1');
    expect(row.organizationId).toBe('org_1');
    expect(row.domain).toBe('acme.com');
    expect(row.status).toBe('pending');
    expect(row.verificationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(store.rows.size).toBe(1);
  });

  it('rejects a duplicate claim from a different organization', async () => {
    await service.claimDomain('acme.com', 'org_1', 'u1');
    await expect(service.claimDomain('acme.com', 'org_other', 'u2')).rejects.toBeInstanceOf(
      CustomHttpException
    );
    try {
      await service.claimDomain('acme.com', 'org_other', 'u2');
    } catch (err) {
      expect((err as CustomHttpException).code).toBe(HttpErrorCode.CONFLICT);
    }
    expect(store.rows.get('acme.com')?.organizationId).toBe('org_1');
  });

  it('lets the same organization re-claim its own domain (rotates the token)', async () => {
    const first = await service.claimDomain('acme.com', 'org_1', 'u1');
    const second = await service.claimDomain('acme.com', 'org_1', 'u1');
    expect(second.id).toBe(first.id);
    expect(second.verificationToken).not.toBe(first.verificationToken);
    expect(second.status).toBe('pending');
  });

  it('rejects malformed domains on both check and claim', async () => {
    await expect(service.checkDomain('not a domain')).rejects.toBeInstanceOf(CustomHttpException);
    await expect(service.checkDomain('')).rejects.toBeInstanceOf(CustomHttpException);
    await expect(service.claimDomain('-bad-.com', 'org_1', 'u1')).rejects.toBeInstanceOf(
      CustomHttpException
    );
  });
});