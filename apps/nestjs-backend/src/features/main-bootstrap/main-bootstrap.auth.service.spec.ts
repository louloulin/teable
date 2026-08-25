/**
 * Main bootstrap — NestJS auth service spec (Stage 97).
 */

import { MainBootstrapAuthService } from './main-bootstrap.auth.service';

interface IPrismaMock {
  // bootstrap service is stateful in memory — prisma not used.
  [key: string]: never;
}

function makePrisma(): IPrismaMock {
  return {} as IPrismaMock;
}

describe('MainBootstrapAuthService.initialize', () => {
  it('returns plan', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    const p = svc.initialize({});
    expect(p.state).toBe('init');
  });
});

describe('MainBootstrapAuthService.setState', () => {
  it('transitions', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({});
    const next = svc.setState({ to: 'starting' });
    expect(next.state).toBe('starting');
  });
  it('throws when not initialized', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    expect(() => svc.setState({ to: 'starting' })).toThrow();
  });
});

describe('MainBootstrapAuthService.shutdown', () => {
  it('shuts down', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({});
    svc.setState({ to: 'starting' });
    svc.setState({ to: 'ready' });
    const out = svc.shutdown({ signal: 'SIGTERM', now: '2026-08-25T00:00:00Z' });
    expect(out.plan.state).toBe('shutting_down');
    expect(out.signal.signal).toBe('SIGTERM');
  });
});

describe('MainBootstrapAuthService.isStopped', () => {
  it('false initially', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    expect(svc.isStopped()).toBe(true);
  });
  it('false in ready', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({});
    svc.setState({ to: 'starting' });
    svc.setState({ to: 'ready' });
    expect(svc.isStopped()).toBe(false);
  });
});

describe('MainBootstrapAuthService.requiredStepCount', () => {
  it('counts', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({});
    expect(svc.requiredStepCount()).toBe(4);
  });
});

describe('MainBootstrapAuthService.build', () => {
  it('builds', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    const p = svc.build({
      config: { appName: 'X', version: '1', port: 3000, shutdownTimeoutMs: 5000 },
      steps: [{ name: 'a', required: true }],
    });
    expect(p.appName).toBe('X');
  });
});

describe('MainBootstrapAuthService.reset', () => {
  it('clears', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({});
    svc.reset();
    expect(svc.getPlan()).toBeNull();
  });
});

describe('MainBootstrapAuthService.snapshot', () => {
  it('shape', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    svc.initialize({ appName: 'X', version: '1', port: 3000 });
    const s = svc.snapshot();
    expect(s?.appName).toBe('X');
  });
  it('null when not init', () => {
    const svc = new MainBootstrapAuthService(makePrisma() as never);
    expect(svc.snapshot()).toBeNull();
  });
});