/**
 * Health controller — NestJS auth service spec (Stage 98).
 */

import { HealthControllerAuthService } from './health-controller.auth.service';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(ok = true): IPrismaMock {
  return {
    $queryRaw: vi.fn(async () => {
      if (!ok) throw new Error('prisma down');
      return [{ '?column?': 1 }];
    }),
  };
}

describe('HealthControllerAuthService.health', () => {
  it('healthy', async () => {
    const svc = new HealthControllerAuthService(makePrisma() as never);
    const s = await svc.health({ appName: 'X', version: '1' });
    expect(s.state).toBe('healthy');
    expect(s.checks.length).toBeGreaterThan(0);
  });
  it('degraded when prisma fails', async () => {
    const svc = new HealthControllerAuthService(makePrisma(false) as never);
    const s = await svc.health({ appName: 'X', version: '1' });
    expect(s.state).toBe('degraded');
  });
});

describe('HealthControllerAuthService.live / ready', () => {
  it('healthy → live + ready', async () => {
    const svc = new HealthControllerAuthService(makePrisma() as never);
    expect(await svc.live({ appName: 'X', version: '1' })).toBe(true);
    expect(await svc.ready({ appName: 'X', version: '1' })).toBe(true);
  });
  it('degraded → live, not ready', async () => {
    const svc = new HealthControllerAuthService(makePrisma(false) as never);
    expect(await svc.live({ appName: 'X', version: '1' })).toBe(true);
    expect(await svc.ready({ appName: 'X', version: '1' })).toBe(false);
  });
});

describe('HealthControllerAuthService.version', () => {
  it('shape', () => {
    const svc = new HealthControllerAuthService(makePrisma() as never);
    const v = svc.version({ version: '1.2.3' });
    expect(v.version).toBe('1.2.3');
  });
});