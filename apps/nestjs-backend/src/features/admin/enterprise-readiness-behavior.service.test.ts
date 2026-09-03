/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-INFRA-6: real behavior probes for EnterpriseReadiness.
 *
 * Unit tests for EnterpriseReadinessBehaviorService using a mocked
 * Prisma surface. Probes that hit the DB resolve through `safe()` which
 * already catches thrown errors, so we exercise both success and failure
 * paths without needing a live pool.
 *
 * Live behavior verification happens in scripts/verify-enterprise.sh
 * (which restarts the backend against the real meta schema).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseReadinessBehaviorService } from './enterprise-readiness-behavior.service';

// Minimal prisma surface — only the delegates the probes call.
type FakePrisma = {
  auditEvent: { count: ReturnType<typeof vi.fn> };
  oauthApplication: { count: ReturnType<typeof vi.fn> };
  ssoIdentityProvider: { count: ReturnType<typeof vi.fn> };
  userTotpFactor: { count: ReturnType<typeof vi.fn> };
  setting: { count: ReturnType<typeof vi.fn> };
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
};

const buildPrisma = (): FakePrisma => ({
  auditEvent: { count: vi.fn().mockResolvedValue(0) },
  oauthApplication: { count: vi.fn().mockResolvedValue(0) },
  ssoIdentityProvider: { count: vi.fn().mockResolvedValue(0) },
  userTotpFactor: { count: vi.fn().mockResolvedValue(0) },
  setting: { count: vi.fn().mockResolvedValue(0) },
  $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists: true }]),
});

const buildService = (prisma: FakePrisma) =>
  new EnterpriseReadinessBehaviorService(prisma as unknown as ConstructorParameters<typeof EnterpriseReadinessBehaviorService>[0]);

describe('EnterpriseReadinessBehaviorService', () => {
  let prisma: FakePrisma;
  let svc: EnterpriseReadinessBehaviorService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = buildService(prisma);
  });

  it('unknown keys fall back to moduleWiring (no probe registered)', async () => {
    const ev = await svc.probe('this_key_does_not_exist_anywhere');
    expect(ev.kind).toBe('moduleWiring');
    expect(ev.detail).toBe('no_behavior_probe_registered');
    expect(ev.lastProbeAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sso probe returns behaviorVerified when the query succeeds', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 2 }]);
    const ev = await svc.probe('sso');
    expect(ev.kind).toBe('behaviorVerified');
    expect(ev.detail).toMatch(/sso_providers=2/);
    expect(ev.probes?.[0]?.name).toBe('sso');
    expect(ev.probes?.[0]?.ok).toBe(true);
  });

  it('sso probe returns blockedByExternalService when the DB throws', async () => {
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('connection refused'));
    const ev = await svc.probe('sso');
    expect(ev.kind).toBe('blockedByExternalService');
    expect(ev.detail).toMatch(/sso: connection refused/);
    expect(ev.probes?.[0]?.ok).toBe(false);
  });

  it('scim probe inspects meta.scim_push_event', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ exists: false }]);
    const ev = await svc.probe('scim');
    expect(ev.kind).toBe('blockedByExternalService');
    expect(ev.detail).toMatch(/scim_table_present/);
  });

  it('audit_log probe reports event count', async () => {
    prisma.auditEvent.count.mockResolvedValueOnce(42);
    const ev = await svc.probe('audit_log');
    expect(ev.kind).toBe('behaviorVerified');
    expect(ev.detail).toMatch(/audit_events=42/);
  });

  it('smtp probe is blockedByExternalService when no smtp config', async () => {
    prisma.setting.count.mockResolvedValueOnce(0);
    const ev = await svc.probe('smtp');
    expect(ev.kind).toBe('blockedByExternalService');
    expect(ev.detail).toMatch(/no_smtp_config/);
  });

  it('smtp probe is behaviorVerified when smtp config present', async () => {
    prisma.setting.count.mockResolvedValueOnce(1);
    const ev = await svc.probe('smtp');
    expect(ev.kind).toBe('behaviorVerified');
    expect(ev.detail).toMatch(/smtp_configured/);
  });

  it('every probe carries an ISO lastProbeAt timestamp', async () => {
    const ev = await svc.probe('sso');
    const ts = Date.parse(ev.lastProbeAt);
    expect(Number.isFinite(ts)).toBe(true);
    expect(Math.abs(Date.now() - ts)).toBeLessThan(10_000);
  });

  it('probe for an unrecognised key never queries the DB', async () => {
    await svc.probe('totally_made_up_capability');
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
