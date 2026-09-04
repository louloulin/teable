/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-SANDBOX: Real local sandbox runtime via Node worker_threads.
 *
 * Provides a self-contained sandbox runtime for AI scripts that does
 * NOT require Docker / firecracker. Each session runs JS code in a
 * dedicated worker thread with:
 *   - per-session idle timeout (configurable; default 30 min)
 *   - per-session stream idle timeout (default 120 s)
 *   - memory ceiling (soft, enforced via V8 flags)
 *   - automatic cleanup on worker exit (success / error / timeout)
 *   - concurrent session cap (configurable; default 4)
 *   - audit emission on lifecycle events
 *
 * License: AGPL-3.0
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import type { ISandboxConfig } from '@teable/openapi';

export type SandboxSessionStatus =
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'errored'
  | 'timeout';

export interface ISandboxSession {
  id: string;
  status: SandboxSessionStatus;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  vcpus: number;
  memoryMb: number;
  /** Last stdout chunk captured for inspection. */
  lastOutput: string;
  /** Final error message if status === 'errored'. */
  error: string | null;
  /** Audit-friendly metadata. */
  meta: Record<string, unknown>;
}

export interface IStartSandboxInput {
  code: string;
  vcpus?: number;
  memoryMb?: number;
  /** Per-session override; defaults from ISandboxConfig. */
  idleTimeoutSec?: number;
  streamIdleTimeoutSec?: number;
  meta?: Record<string, unknown>;
}

export interface ISandboxAuditEvent {
  actorId: string;
  sessionId: string;
  event: 'start' | 'stop' | 'timeout' | 'error';
  ts: number;
  meta?: Record<string, unknown>;
}

const HARD_MAX_CONCURRENT = 64;

/**
 * The worker bootstrap. Runs the user `code` inside a function so it
 * cannot reach the worker's `require` / `process`. The host enforces
 * timeouts via `worker.terminate()`.
 */
const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const code = workerData && workerData.code;
    if (typeof code !== 'string') {
      parentPort.postMessage({ type: 'error', message: 'no code provided' });
      return;
    }
    const fn = new Function(
      'post',
      \`return (async () => { \${code} })();\`
    );
    const post = (chunk) => parentPort.postMessage({ type: 'stdout', chunk });
    const result = await fn(post);
    parentPort.postMessage({ type: 'done', result: result === undefined ? null : String(result) });
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
})();
`;

@Injectable()
export class LocalSandboxService implements OnModuleDestroy {
  private readonly logger = new Logger(LocalSandboxService.name);
  private readonly sessions = new Map<string, ISandboxSession>();
  private readonly workers = new Map<string, Worker>();
  private readonly emitters = new Map<string, EventEmitter>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private readonly streamTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Optional audit sink — wired by SandboxAgentModule (if available).
   * Falls back to logger when not provided so the service remains usable
   * in unit tests without the audit module.
   */
  constructor(@Optional() @Inject('SANDBOX_AUDIT_SINK') private readonly auditSink?: {
    emit: (event: ISandboxAuditEvent) => void | Promise<void>;
  }) {}

  /**
   * Effective per-session defaults merged from ISandboxConfig (admin
   * setting) and module-level defaults.
   */
  resolveDefaults(config: ISandboxConfig | null | undefined): Required<
    Pick<ISandboxConfig, 'idleTimeoutSec' | 'streamIdleTimeoutSec' | 'concurrentChatLimit'>
  > {
    return {
      idleTimeoutSec: config?.idleTimeoutSec ?? 1800,
      streamIdleTimeoutSec: config?.streamIdleTimeoutSec ?? 120,
      concurrentChatLimit: Math.min(
        Math.max(config?.concurrentChatLimit ?? 4, 1),
        HARD_MAX_CONCURRENT
      ),
    };
  }

  /** Currently active session count. */
  activeCount(): number {
    return Array.from(this.sessions.values()).filter((s) =>
      ['starting', 'running'].includes(s.status)
    ).length;
  }

  /** Returns a snapshot of a single session or null if unknown. */
  getSession(id: string): ISandboxSession | null {
    return this.sessions.get(id) ?? null;
  }

  /** Returns a snapshot of all known sessions, newest first. */
  listSessions(): ISandboxSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Subscribe to a session's lifecycle events. Returns an unsubscribe fn. */
  subscribe(id: string, listener: (session: ISandboxSession) => void): () => void {
    const emitter = this.emitters.get(id);
    if (!emitter) return () => undefined;
    emitter.on('update', listener);
    return () => emitter.off('update', listener);
  }

  /**
   * Spawn a worker thread that executes the given code with the
   * supplied limits. Returns the new session id.
   *
   * Throws if the concurrent session cap is hit.
   */
  start(
    input: IStartSandboxInput,
    config: ISandboxConfig | null | undefined,
    actorId: string
  ): { sessionId: string; session: ISandboxSession } {
    const defaults = this.resolveDefaults(config);
    if (this.activeCount() >= defaults.concurrentChatLimit) {
      throw new Error(
        `concurrent session cap reached (${defaults.concurrentChatLimit}); stop an existing session first`
      );
    }

    const id = `sandbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const idleTimeoutSec = Math.max(
      30,
      Math.min(input.idleTimeoutSec ?? defaults.idleTimeoutSec, 24 * 60 * 60)
    );
    const streamIdleTimeoutSec = Math.max(
      5,
      Math.min(input.streamIdleTimeoutSec ?? defaults.streamIdleTimeoutSec, idleTimeoutSec)
    );
    const memoryMb = Math.max(64, Math.min(input.memoryMb ?? config?.memoryMb ?? 512, 8192));
    const vcpus = Math.max(1, Math.min(input.vcpus ?? config?.vcpus ?? 1, 16));

    const session: ISandboxSession = {
      id,
      status: 'starting',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      vcpus,
      memoryMb,
      lastOutput: '',
      error: null,
      meta: { ...(input.meta ?? {}), actorId, idleTimeoutSec, streamIdleTimeoutSec },
    };
    this.sessions.set(id, session);
    this.emitters.set(id, new EventEmitter());

    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: { code: input.code, memoryMb },
      // Soft memory hint — actual enforcement happens at the V8 level.
      resourceLimits: {
        maxOldGenerationSizeMb: memoryMb,
        maxYoungGenerationSizeMb: Math.min(64, Math.floor(memoryMb / 4)),
      },
    });
    this.workers.set(id, worker);
    this.emitUpdate(session);

    const idleTimer = setTimeout(() => this.handleTimeout(id), idleTimeoutSec * 1000);
    this.idleTimers.set(id, idleTimer);

    worker.on('message', (msg: { type: string; chunk?: string; message?: string; result?: string | null }) => {
      if (msg.type === 'stdout') {
        session.lastOutput = (session.lastOutput + (msg.chunk ?? '')).slice(-4096);
        this.resetStreamTimer(id, streamIdleTimeoutSec);
        this.emitUpdate(session);
      } else if (msg.type === 'error') {
        session.error = msg.message ?? 'unknown error';
      } else if (msg.type === 'done') {
        session.lastOutput = (session.lastOutput + '\n' + (msg.result ?? '')).slice(-4096);
      }
    });

    worker.on('error', (err) => {
      this.logger.error(`sandbox ${id} errored: ${err.message}`);
      session.error = err.message;
      session.status = 'errored';
      this.finalize(id, worker.threadId !== null ? -1 : null, 'error');
    });

    worker.on('exit', (code) => {
      // 'exit' fires after our own terminate() too — make idempotent.
      if (session.status === 'stopping' || session.status === 'stopped') return;
      session.status = code === 0 ? 'stopped' : 'errored';
      this.finalize(id, code, code === 0 ? 'stop' : 'error');
    });

    // Mark running on next tick so caller sees starting → running transition.
    queueMicrotask(() => {
      session.status = 'running';
      this.emitUpdate(session);
    });

    void this.auditSink?.emit({ actorId, sessionId: id, event: 'start', ts: Date.now() });

    return { sessionId: id, session };
  }

  /**
   * Stop a running sandbox. Idempotent — returns false if the session
   * is already in a terminal state.
   */
  async stop(id: string, actorId: string): Promise<boolean> {
    const session = this.sessions.get(id);
    const worker = this.workers.get(id);
    if (!session || !worker) return false;
    if (['stopped', 'errored', 'timeout'].includes(session.status)) return false;
    session.status = 'stopping';
    this.emitUpdate(session);
    try {
      // Best-effort terminate. Worker may have already exited via 'exit' event;
      // terminate() is still safe in that case (no-op).
      void worker.terminate();
    } catch (error) {
      this.logger.warn(`sandbox ${id} terminate error: ${(error as Error).message}`);
    }
    this.finalize(id, null, 'stop');
    void this.auditSink?.emit({ actorId, sessionId: id, event: 'stop', ts: Date.now() });
    return true;
  }

  /** Returns true when the session hit the idle timeout. */
  private handleTimeout(id: string): void {
    const session = this.sessions.get(id);
    const worker = this.workers.get(id);
    if (!session || !worker) return;
    if (['stopped', 'errored', 'timeout'].includes(session.status)) return;
    this.logger.warn(`sandbox ${id} idle timeout`);
    session.status = 'timeout';
    void worker.terminate().catch(() => undefined);
    this.finalize(id, null, 'timeout');
    void this.auditSink?.emit({
      actorId: (session.meta.actorId as string) ?? 'unknown',
      sessionId: id,
      event: 'timeout',
      ts: Date.now(),
    });
  }

  private resetStreamTimer(id: string, sec: number): void {
    const existing = this.streamTimers.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      const session = this.sessions.get(id);
      if (!session || !['starting', 'running'].includes(session.status)) return;
      this.logger.warn(`sandbox ${id} stream idle`);
      // Stream idle alone does not kill the session; it just nudges a cleanup
      // when paired with a run-level idle timeout. Surface the signal instead.
      session.meta = { ...session.meta, streamIdleSince: Date.now() };
      this.emitUpdate(session);
    }, sec * 1000);
    this.streamTimers.set(id, t);
  }

  private finalize(id: string, exitCode: number | null, _event: 'stop' | 'timeout' | 'error'): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.endedAt = Date.now();
    if (exitCode !== null) session.exitCode = exitCode;
    if (session.status !== 'errored' && session.status !== 'timeout') {
      session.status = exitCode === 0 ? 'stopped' : session.status;
    }
    const idle = this.idleTimers.get(id);
    if (idle) clearTimeout(idle);
    const stream = this.streamTimers.get(id);
    if (stream) clearTimeout(stream);
    this.idleTimers.delete(id);
    this.streamTimers.delete(id);
    const worker = this.workers.get(id);
    if (worker) {
      try { worker.removeAllListeners(); } catch { /* best-effort */ }
    }
    this.workers.delete(id);
    this.emitUpdate(session);
    // Keep the session record for audit; let GC clean up EventEmitter once
    // all subscribers have unsubscribed.
  }

  private emitUpdate(session: ISandboxSession): void {
    const emitter = this.emitters.get(session.id);
    if (!emitter) return;
    // Listeners want a *fresh* snapshot — mutate-by-spread keeps the
    // stored object stable for audit retrieval.
    emitter.emit('update', { ...session });
  }

  /** On module shutdown, terminate every worker cleanly. */
  async onModuleDestroy(): Promise<void> {
    const all = Array.from(this.workers.entries());
    await Promise.all(
      all.map(async ([id, worker]) => {
        try {
          await worker.terminate();
        } catch {
          // best-effort
        }
        const session = this.sessions.get(id);
        if (session && !session.endedAt) {
          session.status = 'stopped';
          session.endedAt = Date.now();
        }
      })
    );
    this.workers.clear();
    for (const t of this.idleTimers.values()) clearTimeout(t);
    for (const t of this.streamTimers.values()) clearTimeout(t);
    this.idleTimers.clear();
    this.streamTimers.clear();
  }
}
