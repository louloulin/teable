/* eslint-disable @typescript-eslint/naming-convention */
import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { PinAuthService } from './pin.auth.service';
import { isPinStale, normalizePinRecordId } from './pin.helpers';

interface IMockPinTable {
  findFirst: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  pin: IMockPinTable;
}

const buildPrisma = (): IMockPrisma => ({
  pin: { findFirst: vi.fn() },
});

describe('PinAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: PinAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new PinAuthService(prisma as never);
  });

  it('resolvePin returns user/record when pin is found', async () => {
    prisma.pin.findFirst.mockResolvedValueOnce({
      id: 'p1',
      tableId: 'tbl1',
      recordId: 'rec1',
      userId: 'u1',
      lastUsedTime: null,
    });
    const out = await svc.resolvePin('tbl1', 'rec1');
    expect(out.userId).toBe('u1');
    expect(out.recordId).toBe('rec1');
  });

  it('resolvePin throws NotFoundException when no row matches', async () => {
    prisma.pin.findFirst.mockResolvedValueOnce(null);
    await expect(svc.resolvePin('tbl1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizePinRecordId trims whitespace', () => {
    expect(normalizePinRecordId('  rec1  ')).toBe('rec1');
  });

  it('isPinStale returns true when lastUsedTime is older than maxAgeMs', () => {
    const now = new Date('2026-08-25T00:00:00Z');
    const stale = new Date('2026-08-24T00:00:00Z');
    expect(isPinStale({ lastUsedTime: stale }, 60_000, now)).toBe(true);
    expect(isPinStale({ lastUsedTime: now }, 60_000, now)).toBe(false);
    expect(isPinStale({ lastUsedTime: null }, 60_000, now)).toBe(false);
  });
});