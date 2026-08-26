/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { IpAllowlistAuthService } from './ip-allowlist.auth.service';
import {
  evaluateAllowlist,
  findMatchingCidr,
  ipMatchesCidr,
  ipToInt,
  parseCidr,
} from './ip-allowlist.helpers';

interface IMockSettingTable {
  findFirst: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  setting: IMockSettingTable;
}

const buildPrisma = (): IMockPrisma => ({
  setting: { findFirst: vi.fn() },
});

describe('IpAllowlistAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: IpAllowlistAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new IpAllowlistAuthService(prisma as never);
  });

  it('check returns allowlist-empty when setting row is absent', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce(null);
    const out = await svc.check('10.0.0.1');
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('allowlist-empty');
  });

  it('check returns in-allowlist when IP matches a CIDR', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce({
      value: JSON.stringify([{ cidr: '10.0.0.0/8' }]),
    });
    const out = await svc.check('10.1.2.3');
    expect(out.allowed).toBe(true);
    expect(out.matchedCidr).toBe('10.0.0.0/8');
  });

  it('check returns not-in-allowlist when no CIDR matches', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce({
      value: JSON.stringify([{ cidr: '192.168.0.0/16' }]),
    });
    const out = await svc.check('10.0.0.1');
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('not-in-allowlist');
  });
});

describe('ip-allowlist helpers', () => {
  it('parseCidr handles both bare IPs and CIDR', () => {
    expect(parseCidr('10.0.0.1')).toEqual({ address: '10.0.0.1', prefix: 32 });
    expect(parseCidr('10.0.0.0/8')).toEqual({ address: '10.0.0.0', prefix: 8 });
    expect(parseCidr('invalid')).toBeNull();
  });

  it('ipToInt returns null for malformed IPs', () => {
    expect(ipToInt('10.0.0.1')).toBe(0x0a000001);
    expect(ipToInt('not.an.ip.addr')).toBeNull();
  });

  it('ipMatchesCidr tests within and outside the CIDR', () => {
    expect(ipMatchesCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipMatchesCidr('11.1.2.3', '10.0.0.0/8')).toBe(false);
  });

  it('findMatchingCidr returns the first matching entry', () => {
    expect(findMatchingCidr('10.1.2.3', [{ cidr: '192.168.0.0/16' }, { cidr: '10.0.0.0/8' }])).toBe('10.0.0.0/8');
    expect(findMatchingCidr('8.8.8.8', [{ cidr: '10.0.0.0/8' }])).toBeNull();
  });

  it('evaluateAllowlist reports the right reason', () => {
    expect(evaluateAllowlist('10.0.0.1', [])).toEqual({ allowed: false, reason: 'allowlist-empty' });
    expect(evaluateAllowlist('10.0.0.1', [{ cidr: '10.0.0.0/8' }])).toEqual({
      allowed: true,
      matchedCidr: '10.0.0.0/8',
      reason: 'in-allowlist',
    });
    expect(evaluateAllowlist('8.8.8.8', [{ cidr: '10.0.0.0/8' }])).toEqual({
      allowed: false,
      reason: 'not-in-allowlist',
    });
  });
});