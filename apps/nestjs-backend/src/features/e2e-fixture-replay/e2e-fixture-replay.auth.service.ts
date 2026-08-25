/**
 * E2E fixture replay — NestJS auth service (Stage 100).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyStepResult,
  capSteps,
  finalize,
  isTerminal,
  markReplaying,
  planReplaySteps,
  startSession,
  summarize,
} from './e2e-fixture-replay.service';
import type {
  IFixtureReplaySession,
  IReplayRequest,
  IReplaySummary,
} from './e2e-fixture-replay.types';

interface IReplayStore {
  sessions: Map<string, IFixtureReplaySession>;
}

function makeStore(): IReplayStore {
  return { sessions: new Map() };
}

@Injectable()
export class E2eFixtureReplayAuthService {
  private readonly store: IReplayStore = makeStore();

  constructor(private readonly prisma: PrismaService) {}

  /** Begin a replay session for the given fixture. */
  begin(input: { req: IReplayRequest }): IFixtureReplaySession {
    const session = startSession(input);
    const capped = capSteps(session);
    this.store.sessions.set(capped.id, capped);
    return capped;
  }

  /** Transition to replaying. */
  start(id: string): IFixtureReplaySession | null {
    const s = this.store.sessions.get(id);
    if (!s) return null;
    const next = markReplaying(s);
    this.store.sessions.set(id, next);
    return next;
  }

  /** Record a step result. */
  recordStep(input: {
    id: string;
    stepId: string;
    passed: boolean;
    error?: string;
  }): IFixtureReplaySession | null {
    const s = this.store.sessions.get(input.id);
    if (!s) return null;
    const next = applyStepResult({
      session: s,
      stepId: input.stepId,
      passed: input.passed,
      error: input.error,
    });
    this.store.sessions.set(input.id, next);
    return next;
  }

  /** Finalize the session. */
  finish(input: { id: string; ok: boolean }): IFixtureReplaySession | null {
    const s = this.store.sessions.get(input.id);
    if (!s) return null;
    const next = finalize({ session: s, ok: input.ok });
    this.store.sessions.set(input.id, next);
    return next;
  }

  /** Get summary for a session. */
  summary(id: string): IReplaySummary | null {
    const s = this.store.sessions.get(id);
    if (!s) return null;
    return summarize(s);
  }

  /** Read session. */
  get(id: string): IFixtureReplaySession | null {
    return this.store.sessions.get(id) ?? null;
  }

  /** Plan-only path — return the canonical step list for a fixture id. */
  plan(input: { fixtureId: string }) {
    return planReplaySteps(input);
  }

  /** Whether the session is in a terminal state. */
  isDone(id: string): boolean {
    const s = this.store.sessions.get(id);
    if (!s) return false;
    return isTerminal(s);
  }

  /** List session ids (in insertion order). */
  listIds(): string[] {
    return Array.from(this.store.sessions.keys());
  }

  /** Verify the underlying Prisma connection is alive (used by health check). */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
