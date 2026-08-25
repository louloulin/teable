/**
 * Real-time cursor / presence protocol — Stage 49.
 *
 * A `PresenceSession` represents an active user connected to a
 * shared resource (a base/table/view/record). Each session is
 * bounded by an `expiresAt` after which the heartbeat is considered
 * stale.
 *
 * A `CursorState` is the optional cursor position (cell, row, column)
 * the user is currently working on. The presence service can also
 * persist a `selectionRange` (cell range) for richer collaboration.
 *
 * The protocol is intentionally small and protocol-agnostic: the
 * transport layer (WebSocket / SSE / etc.) is layered on top.
 */

export type PresenceScope = 'base' | 'table' | 'view' | 'record';

export type PresenceStatus = 'active' | 'idle' | 'away' | 'offline';

export interface ICursorState {
  /// Table id the cursor is currently positioned in.
  tableId: string;
  /// 1-based row index the cursor sits on; 0 means no row.
  rowIndex: number;
  /// Field id the cursor is currently positioned in; '' means no cell.
  fieldId: string;
  /// Optional selection range; { rowIndex, fieldId } only.
  selectionRange?: {
    start: { rowIndex: number; fieldId: string };
    end: { rowIndex: number; fieldId: string };
  };
}

export interface IPresenceSession {
  id: string;
  baseId: string;
  /// Optional narrower scope. Empty means the session is bound only to baseId.
  scope: PresenceScope;
  scopeId: string;
  userId: string;
  /// Display color for the avatar, e.g. '#3b82f6'.
  color: string;
  /// Display name; rendered in the presence bubble.
  displayName: string;
  status: PresenceStatus;
  cursor?: ICursorState;
  /// Heartbeat timestamp updated on each `tick` call.
  lastHeartbeatAt: Date;
  /// Hard expiry; the session is considered offline past this point.
  expiresAt: Date;
  connectedAt: Date;
}

export interface IJoinPresenceInput {
  baseId: string;
  scope: PresenceScope;
  scopeId: string;
  userId: string;
  color: string;
  displayName: string;
}

export interface IUpdateCursorInput {
  sessionId: string;
  cursor: ICursorState;
}

export interface IUpdateStatusInput {
  sessionId: string;
  status: PresenceStatus;
}

export interface ITickInput {
  sessionId: string;
  /// Optional status override on heartbeat.
  status?: PresenceStatus;
}

export interface IPresenceQueryInput {
  baseId: string;
  scope?: PresenceScope;
  scopeId?: string;
}

export const DEFAULT_HEARTBEAT_TTL_MS = 30_000;
export const DEFAULT_CURSOR_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
export const DEFAULT_DISPLAY_NAME_MAX_LENGTH = 64;
export const DEFAULT_MAX_SESSIONS_PER_USER_PER_SCOPE = 3;
