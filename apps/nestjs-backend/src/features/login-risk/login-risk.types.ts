/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Login risk / anomaly detection — Stage 76.
 *
 * Records per-login features (device, geo, time, failure burst) and decides
 * whether to allow / challenge / soft-block / hard-block based on the
 * risk policy from Stage 75. Also tracks per-actor history used for
 * impossible-travel detection.
 */

export type LoginOutcome = 'success' | 'mfa-challenge' | 'soft-blocked' | 'hard-blocked' | 'failed';

export interface ILoginFingerprint {
  deviceId: string;
  ip: string;
  countryCode: string;
  regionCode: string;
  /** UTC offset minutes. */
  tzOffsetMinutes: number;
  userAgent: string;
}

export interface ILoginAttempt {
  id: string;
  orgId: string;
  actorId: string;
  fingerprint: ILoginFingerprint;
  outcome: LoginOutcome;
  /** Risk band assigned by the policy (from Stage 75). */
  band: string;
  occurredAt: string;
  /** When outcome=failed, the reason (bad-password, locked, etc). */
  failureReason: string | null;
}

export interface ILoginHistory {
  actorId: string;
  /** Most recent successful fingerprints (oldest → newest). */
  recent: ILoginFingerprint[];
  /** Per-day failed login counter. */
  failedCountByDay: Record<string, number>;
  /** Last successful login timestamp. */
  lastSuccessAt: string | null;
}

export interface ILoginRiskInput {
  fingerprint: ILoginFingerprint;
  history: ILoginHistory;
  /** Current cluster of failed-login timestamps in the last minute. */
  recentFailed: { occurredAt: string }[];
  now: string;
}

export interface ILoginRiskOutput {
  /** True when at least one anomaly was detected. */
  anomalous: boolean;
  /** Reasons — human readable tags (new-device, new-location, etc). */
  reasons: string[];
  /** Forced outcome override — hard-block/soft-block override Stage 75 default. */
  forcedOutcome: LoginOutcome | null;
  /** If true, force MFA even if no anomaly was found. */
  forceMfa: boolean;
}

export const MAX_RECENT_FINGERPRINTS = 16;
export const MAX_FAILED_LOGINS_PER_MIN = 10;
export const IMPOSSIBLE_TRAVEL_KMH = 1000;
export const NEW_LOCATION_DISTANCE_KM = 200;
export const FAILED_BURST_WINDOW_MS = 60_000;

export const LOGIN_RISK_REASON_LABELS: Record<string, string> = {
  'new-device': '新设备登录',
  'new-location': '新地理位置登录',
  'impossible-travel': '不可能地理位移',
  'failed-burst': '短时间内多次失败',
  'inactive-long': '长时间未活跃',
  'suspicious-ua': '可疑 User-Agent',
};
