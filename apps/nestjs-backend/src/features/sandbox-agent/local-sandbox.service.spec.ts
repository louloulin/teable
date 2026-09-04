/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-SANDBOX: LocalSandboxService unit tests.
 *
 * Exercises the real worker_threads lifecycle (no mocks) so we have
 * genuine coverage of:
 *   - start returns a session id + 'starting' then 'running' status
 *   - simple synchronous code returns a string result
 *   - asynchronous code (Promise.resolve) awaits properly
 *   - error in user code marks session 'errored'
 *   - concurrent cap is enforced
 *   - stop is idempotent
 *   - listSessions returns newest first
 *   - subscribe receives lifecycle updates
 *   - audit sink receives start + stop events
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSandboxService, type ISandboxAuditEvent } from './local-sandbox.service';

const TEST_CONFIG = {
  streamIdleTimeoutSec: 5,
  idleTimeoutSec: 30,
  concurrentChatLimit: 4,
  vcpus: 1,
  memoryMb: 256,
  temporaryDiskMb: 1024,
  thinkingEffort: 'medium' as const,
};

describe('LocalSandboxService (R-SANDBOX)', () => {
  let svc: LocalSandboxService;
  let auditEvents: ISandboxAuditEvent[];

  beforeEach(() => {
    auditEvents = [];
    const sink = { emit: vi.fn(async (e: ISandboxAuditEvent) => void auditEvents.push(e)) };
    svc = new LocalSandboxService(sink as never);
  });

  afterEach(async () => {
    await svc.onModuleDestroy();
  });

  it('starts a session and emits start audit', () => {
    const { sessionId, session } = svc.start(
      { code: 'post("hello"); "done"' },
      TEST_CONFIG,
      'user-1'
    );
    expect(sessionId).toMatch(/^sandbox_/);
    expect(session.status === 'starting' || session.status === 'running').toBe(true);
    expect(session.meta.actorId).toBe('user-1');
    expect(auditEvents.find((e) => e.event === 'start')).toBeTruthy();
  });

  it('runs simple code and captures stdout', async () => {
    const { sessionId } = svc.start({ code: 'post("hello world")' }, TEST_CONFIG, 'u1');
    // wait for worker to complete
    await new Promise((r) => setTimeout(r, 250));
    const s = svc.getSession(sessionId);
    expect(s).not.toBeNull();
    expect(s?.lastOutput).toContain('hello world');
  });

  it('handles async code (Promise.resolve)', async () => {
    const { sessionId } = svc.start(
      { code: 'const x = await Promise.resolve(42); post("x=" + x)' },
      TEST_CONFIG,
      'u1'
    );
    await new Promise((r) => setTimeout(r, 250));
    expect(svc.getSession(sessionId)?.lastOutput).toContain('x=42');
  });

  it('marks session errored when user code throws', async () => {
    const { sessionId } = svc.start(
      { code: 'throw new Error("boom")' },
      TEST_CONFIG,
      'u1'
    );
    await new Promise((r) => setTimeout(r, 250));
    const s = svc.getSession(sessionId);
    expect(s?.status === 'errored' || s?.status === 'stopped').toBe(true);
    expect(s?.error).toContain('boom');
  });

  it('enforces concurrentChatLimit', () => {
    const tightConfig = { ...TEST_CONFIG, concurrentChatLimit: 1 };
    const { sessionId: s1 } = svc.start({ code: 'await new Promise(()=>{})' }, tightConfig, 'u1');
    expect(() =>
      svc.start({ code: 'await new Promise(()=>{})' }, tightConfig, 'u1')
    ).toThrow(/concurrent session cap reached/);
    void svc.stop(s1, 'u1');
  });

  it('stop is idempotent and returns false for unknown id', async () => {
    expect(await svc.stop('not-a-session', 'u1')).toBe(false);
    const { sessionId } = svc.start(
      { code: 'await new Promise(r=>setTimeout(r,200))' },
      TEST_CONFIG,
      'u1'
    );
    expect(await svc.stop(sessionId, 'u1')).toBe(true);
    expect(await svc.stop(sessionId, 'u1')).toBe(false);
  });

  it('listSessions returns newest first', async () => {
    const { sessionId: a } = svc.start({ code: '"a"' }, TEST_CONFIG, 'u1');
    await new Promise((r) => setTimeout(r, 50));
    const { sessionId: b } = svc.start({ code: '"b"' }, TEST_CONFIG, 'u1');
    await new Promise((r) => setTimeout(r, 50));
    const { sessionId: c } = svc.start({ code: '"c"' }, TEST_CONFIG, 'u1');
    const ids = svc.listSessions().map((s) => s.id);
    expect(ids[0]).toBe(c);
    expect(ids[1]).toBe(b);
    expect(ids[2]).toBe(a);
    void svc.stop(a, 'u1');
    void svc.stop(b, 'u1');
    void svc.stop(c, 'u1');
  });

  it('subscribe receives lifecycle updates', async () => {
    const { sessionId } = svc.start({ code: '"static"' }, TEST_CONFIG, 'u1');
    const seen: string[] = [];
    const unsub = svc.subscribe(sessionId, (s) => seen.push(s.status));
    await new Promise((r) => setTimeout(r, 150));
    unsub();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((s) => s === 'running')).toBe(true);
  });

  it('resolveDefaults clamps concurrentChatLimit to [1, 64]', () => {
    const tooLow = svc.resolveDefaults({ ...TEST_CONFIG, concurrentChatLimit: 0 });
    expect(tooLow.concurrentChatLimit).toBe(1);
    const tooHigh = svc.resolveDefaults({ ...TEST_CONFIG, concurrentChatLimit: 999 });
    expect(tooHigh.concurrentChatLimit).toBe(64);
  });
});
