import { describe, expect, it, vi } from 'vitest';
import { DataDbConnectionService } from './data-db-connection.service';

const row = () => ({
  id: 'ddbc_1', provider: 'postgres' as const, displayHost: 'db.internal:5432',
  displayDatabase: 'analytics', internalSchema: 'teable_a', status: 'pending',
  schemaVersion: null, capabilities: null, lastValidatedAt: null, lastError: null,
  createdBy: 'admin_1', createdTime: new Date('2026-01-01T00:00:00Z'), lastModifiedTime: null,
});

const buildPrisma = () => ({
  dataDbConnection: {
    findMany: vi.fn().mockResolvedValue([row()]),
    create: vi.fn().mockResolvedValue(row()),
    findUnique: vi.fn().mockResolvedValue(row()),
    delete: vi.fn().mockResolvedValue(row()),
  },
  spaceDataDbBinding: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
});

describe('DataDbConnectionService', () => {
  it('lists persisted rows without exposing encryptedUrl', async () => {
    const prisma = buildPrisma();
    const connections = await new DataDbConnectionService(prisma as never).list();
    expect(connections[0]).not.toHaveProperty('encryptedUrl');
    expect(connections[0]).toMatchObject({ displayHost: 'db.internal:5432', provider: 'postgres' });
  });

  it('encrypts and fingerprints the URL before persistence', async () => {
    const prisma = buildPrisma();
    await new DataDbConnectionService(prisma as never).create({
      url: 'postgresql://readonly:secret@db.internal:5432/analytics', createdBy: 'admin_1',
    });
    const data = prisma.dataDbConnection.create.mock.calls[0]?.[0].data;
    expect(data.encryptedUrl).not.toContain('secret');
    expect(data.urlFingerprint).toMatch(/^dbfp_[a-f0-9]{64}$/);
    expect(data.displayHost).toBe('db.internal:5432');
    expect(data.displayDatabase).toBe('analytics');
  });

  it('unbinds spaces before deleting a connection', async () => {
    const prisma = buildPrisma();
    expect(await new DataDbConnectionService(prisma as never).remove('ddbc_1')).toBe(true);
    expect(prisma.spaceDataDbBinding.updateMany).toHaveBeenCalledWith({
      where: { dataDbConnectionId: 'ddbc_1' }, data: { dataDbConnectionId: null },
    });
    expect(prisma.dataDbConnection.delete).toHaveBeenCalledWith({ where: { id: 'ddbc_1' } });
  });
});
