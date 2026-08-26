/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tenant Replay — anonymisation helpers (pure) + CLS context builder.
 *
 * This file holds every helper that the unit tests need to exercise without
 * pulling in the full `@teable/core` graph.  That keeps the test run fast
 * (no NestJS DI) and dependency-free.
 *
 * The intent of `anonymizeSnapshot` is NOT to be a complete GDPR scrubber —
 * that is a much larger problem.  The intent is to ensure that a replay
 * snapshot never echoes real PII into a developer's local environment or a
 * third-party sandbox.
 *
 * `buildReplayClsStore` shapes a `nestjs-cls` payload that the existing
 * services (SpaceService, BaseService, TableService, etc.) accept so the
 * CLI scripts can call them under a system "replay" user.
 */

import type { IClsStore } from '../../types/cls';
import type { IUserSnapshot, ITenantSnapshot } from './tenant-replay.types';

const ANON_EMAIL_DOMAIN = 'example.test';

export const SYSTEM_USER_ID = 'usrSystem0000000000replay';
export const REPLAY_RUN_TAG_PREFIX = 'replay';

/**
 * Build an `IClsStore` payload that the existing services will accept.
 * Uses the `SYSTEM_USER_ID` constant; the replay environment MUST permit
 * system space creation (i.e. an admin user or the global
 * `disallowSpaceCreation` flag set to false).
 */
export const buildReplayClsStore = (
  overrides: Partial<IClsStore['user']> = {}
): IClsStore => ({
  user: {
    id: SYSTEM_USER_ID,
    name: overrides.name ?? 'tenant-replay',
    email: overrides.email ?? 'replay@teable.local',
    isAdmin: overrides.isAdmin ?? true,
  },
  origin: {
    ip: '127.0.0.1',
    byApi: true,
    userAgent: 'tenant-replay-cli',
    referer: '',
  },
  tx: {},
  permissions: ['space|create', 'base|create', 'table|create', 'field|create', 'record|create'],
});

/**
 * Replace any string that looks like an email with `user{N}@example.test`.
 *  - "alice@acme.io"           -> "user1@example.test"
 *  - "Bob.Smith+filter@x.dev"  -> "user2@example.test"
 *
 * Returns the input unchanged if it does not match.
 */
export const scrubEmail = (raw: string, index: number): string => {
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  if (!/@/.test(raw)) return raw;
  return `user${index}@${ANON_EMAIL_DOMAIN}`;
};

/**
 * Replace any display name with `User N`.  Non-string inputs are passed through.
 */
export const scrubName = (raw: unknown, index: number): string => {
  if (typeof raw !== 'string' || raw.length === 0) return raw as string;
  return `User ${index}`;
};

/**
 * Anonymise a single user row.  Returns a NEW object — never mutates the input.
 */
export const anonymizeUser = (
  user: IUserSnapshot,
  index: number
): IUserSnapshot => ({
  sourceUserId: user.sourceUserId,
  name: scrubName(user.name, index),
  email: scrubEmail(user.email, index),
  isAdmin: user.isAdmin,
  isSystem: user.isSystem,
});

/**
 * Deep-clone an anonymised snapshot.  We avoid mutating the source because
 * callers sometimes keep the original around for diffing / debugging.
 */
export const anonymizeSnapshot = (snapshot: ITenantSnapshot): ITenantSnapshot => {
  if (snapshot.anonymized === 'scrub') {
    // Already scrubbed — return a defensive copy so the caller can mutate
    // freely without disturbing the source.
    return structuredCloneSafe(snapshot);
  }

  const cloned = structuredCloneSafe(snapshot);
  cloned.anonymized = 'scrub';
  cloned.users = cloned.users.map((u, i) => anonymizeUser(u, i + 1));
  // spaceName carries the human-readable label of the source space; leaving
  // it intact would leak the tenant's chosen naming.  Replace with a
  // deterministic placeholder so diff'd snapshots stay comparable.
  cloned.spaceName = `Space (${snapshot.sourceSpaceId})`;
  return cloned;
};

/**
 * Best-effort structured clone.  Falls back to JSON round-trip when the
 * platform polyfill is missing (older Node) — the snapshot is plain JSON
 * data so the loss is acceptable.
 */
export const structuredCloneSafe = <T>(value: T): T => {
  const sc = (globalThis as any).structuredClone;
  if (typeof sc === 'function') return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
};
