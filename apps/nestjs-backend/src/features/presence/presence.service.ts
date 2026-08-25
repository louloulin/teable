/**
 * Presence — Stage 49.
 *
 * Pure helpers: validation, expiry derivation, status state machine,
 * session diffing, scope-matching. DB-touching work is delegated to
 * PresenceAuthService.
 */

import type {
  ICursorState,
  IJoinPresenceInput,
  IPresenceSession,
  IPresenceQueryInput,
  ITickInput,
  IUpdateCursorInput,
  IUpdateStatusInput,
  PresenceScope,
  PresenceStatus,
} from './presence.types';
import {
  DEFAULT_CURSOR_COLOR_PATTERN,
  DEFAULT_DISPLAY_NAME_MAX_LENGTH,
  DEFAULT_HEARTBEAT_TTL_MS,
  DEFAULT_MAX_SESSIONS_PER_USER_PER_SCOPE,
} from './presence.types';

export function isValidScope(s: string): s is PresenceScope {
  return s === 'base' || s === 'table' || s === 'view' || s === 'record';
}

export function isValidStatus(s: string): s is PresenceStatus {
  return s === 'active' || s === 'idle' || s === 'away' || s === 'offline';
}

export function isValidColor(c: string): boolean {
  return DEFAULT_CURSOR_COLOR_PATTERN.test(c);
}

export function validateJoinInput(input: IJoinPresenceInput): void {
  if (!input.baseId) throw new Error('baseId required');
  if (!isValidScope(input.scope)) throw new Error(`invalid scope: ${input.scope}`);
  if (!input.scopeId) throw new Error('scopeId required');
  if (!input.userId) throw new Error('userId required');
  if (!input.displayName || input.displayName.trim().length === 0) {
    throw new Error('displayName required');
  }
  if (input.displayName.length > DEFAULT_DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`displayName too long (max ${DEFAULT_DISPLAY_NAME_MAX_LENGTH})`);
  }
  if (!isValidColor(input.color)) {
    throw new Error(`color must be a 6-digit hex string with # prefix: ${input.color}`);
  }
}

export function validateCursor(input: IUpdateCursorInput): void {
  if (!input.sessionId) throw new Error('sessionId required');
  validateCursorShape(input.cursor);
}

export function validateCursorShape(cursor: ICursorState): void {
  if (!cursor.tableId) throw new Error('cursor.tableId required');
  if (cursor.rowIndex < 0) throw new Error('cursor.rowIndex must be ≥ 0');
  if (typeof cursor.fieldId !== 'string' || cursor.fieldId === '') {
    throw new Error('cursor.fieldId required');
  }
  if (cursor.selectionRange) {
    const { start, end } = cursor.selectionRange;
    if (start.fieldId === '' || end.fieldId === '') {
      throw new Error('selectionRange fields required');
    }
    if (start.rowIndex > end.rowIndex) {
      throw new Error('selectionRange.start.rowIndex must be ≤ end.rowIndex');
    }
  }
}

export function validateTickInput(input: ITickInput): void {
  if (!input.sessionId) throw new Error('sessionId required');
  if (input.status !== undefined && !isValidStatus(input.status)) {
    throw new Error(`invalid status: ${input.status}`);
  }
}

export function validateUpdateStatusInput(input: IUpdateStatusInput): void {
  if (!input.sessionId) throw new Error('sessionId required');
  if (!isValidStatus(input.status)) {
    throw new Error(`invalid status: ${input.status}`);
  }
}

export function validateQueryInput(input: IPresenceQueryInput): void {
  if (!input.baseId) throw new Error('baseId required');
  if (input.scope && !isValidScope(input.scope)) {
    throw new Error(`invalid scope: ${input.scope}`);
  }
  if (
    (input.scope === 'table' || input.scope === 'view' || input.scope === 'record') &&
    !input.scopeId
  ) {
    throw new Error(`scopeId required for scope=${input.scope}`);
  }
}

/**
  Derive the presence status given the now and the last heartbeat.
  Returns 'offline' when expired, 'idle' when stale, else 'active'
  unless the existing status is 'away' (sticky).
 */
export function deriveStatusOnTick(
  session: IPresenceSession,
  now: Date,
  idleMs: number = DEFAULT_HEARTBEAT_TTL_MS
): PresenceStatus {
  if (now >= session.expiresAt) return 'offline';
  if (session.status === 'away') return 'away';
  const sinceHeartbeat = now.getTime() - session.lastHeartbeatAt.getTime();
  if (sinceHeartbeat >= idleMs) return 'idle';
  return 'active';
}

/** Compute a new expiresAt given `now` and TTL. */
export function computeExpiresAt(now: Date, ttlMs: number = DEFAULT_HEARTBEAT_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs);
}

/** True when the session has passed its expiresAt at `now`. */
export function isSessionExpired(s: IPresenceSession, now: Date): boolean {
  return now >= s.expiresAt;
}

/** Filter a session list down to entries matching the query. */
export function filterByQuery(
  sessions: ReadonlyArray<IPresenceSession>,
  query: IPresenceQueryInput
): IPresenceSession[] {
  return sessions.filter((s) => matches(s, query));
}

function matches(s: IPresenceSession, q: IPresenceQueryInput): boolean {
  if (s.baseId !== q.baseId) return false;
  if (q.scope && s.scope !== q.scope) return false;
  if (q.scopeId && s.scopeId !== q.scopeId) return false;
  return true;
}

/**
  Reduce raw sessions to only the live ones (still within expiresAt)
  and group them by userId+scope for broadcast.
 */
export function liveSessions(
  sessions: ReadonlyArray<IPresenceSession>,
  now: Date
): IPresenceSession[] {
  return sessions.filter((s) => !isSessionExpired(s, now));
}

/**
  Diff two session lists by id; returns joined/left/right for use in
  client-side reconciliation when broadcasting presence changes.
 */
export interface IPresenceDiff {
  joined: IPresenceSession[];
  left: IPresenceSession[];
  changed: IPresenceSession[];
}

export function diffSessions(
  prev: ReadonlyArray<IPresenceSession>,
  next: ReadonlyArray<IPresenceSession>
): IPresenceDiff {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextById = new Map(next.map((s) => [s.id, s]));
  const joined: IPresenceSession[] = [];
  const left: IPresenceSession[] = [];
  const changed: IPresenceSession[] = [];
  for (const [id, n] of nextById) {
    if (!prevById.has(id)) joined.push(n);
    else if (!sameShape(prevById.get(id)!, n)) changed.push(n);
  }
  for (const [id, p] of prevById) {
    if (!nextById.has(id)) left.push(p);
  }
  return { joined, left, changed };
}

function sameShape(a: IPresenceSession, b: IPresenceSession): boolean {
  return (
    a.status === b.status &&
    sameCursor(a.cursor, b.cursor) &&
    a.expiresAt.getTime() === b.expiresAt.getTime()
  );
}

function sameCursor(a: ICursorState | undefined, b: ICursorState | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.tableId === b.tableId && a.rowIndex === b.rowIndex && a.fieldId === b.fieldId;
}

/**
  Apply a join-policy that prevents the same user from holding more than
  N sessions in the same scope. Returns the list of sessions to drop.
 */
export function applyJoinPolicy(
  existing: ReadonlyArray<IPresenceSession>,
  incoming: { userId: string; scope: PresenceScope; scopeId: string },
  maxPerScope: number = DEFAULT_MAX_SESSIONS_PER_USER_PER_SCOPE
): IPresenceSession[] {
  const sameScope = existing.filter(
    (s) =>
      s.userId === incoming.userId && s.scope === incoming.scope && s.scopeId === incoming.scopeId
  );
  if (sameScope.length < maxPerScope) return [];
  // Drop the oldest by connectedAt to keep the cap stable.
  return sameScope
    .slice()
    .sort((a, b) => a.connectedAt.getTime() - b.connectedAt.getTime())
    .slice(0, sameScope.length - maxPerScope + 1);
}
