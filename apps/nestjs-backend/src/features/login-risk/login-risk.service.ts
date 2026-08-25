/**
 * Login risk — pure helpers (Stage 76).
 */

import type {
  ILoginFingerprint,
  ILoginHistory,
  ILoginRiskInput,
  ILoginRiskOutput,
  LoginOutcome,
} from './login-risk.types';
import {
  FAILED_BURST_WINDOW_MS,
  IMPOSSIBLE_TRAVEL_KMH,
  MAX_FAILED_LOGINS_PER_MIN,
  MAX_RECENT_FINGERPRINTS,
  NEW_LOCATION_DISTANCE_KM,
} from './login-risk.types';

/** Validate a fingerprint. */
export function validateFingerprint(fp: ILoginFingerprint): string | null {
  if (!fp.deviceId) return 'deviceId required';
  if (!fp.ip) return 'ip required';
  if (!fp.countryCode) return 'countryCode required';
  if (!fp.userAgent) return 'userAgent required';
  return null;
}

/** Whether a fingerprint has been seen before in history. */
export function isKnownDevice(input: { fp: ILoginFingerprint; history: ILoginHistory }): boolean {
  return input.history.recent.some(
    (p) =>
      p.deviceId === input.fp.deviceId &&
      p.userAgent === input.fp.userAgent &&
      p.countryCode === input.fp.countryCode
  );
}

/** Compute approximate distance between two country/region pairs (km). */
export function geoDistanceKm(a: ILoginFingerprint, b: ILoginFingerprint): number {
  if (a.countryCode === b.countryCode && a.regionCode === b.regionCode) return 0;
  if (a.countryCode === b.countryCode) return 50;
  // Coarse continent-based fallback.
  return NEW_LOCATION_DISTANCE_KM + 500;
}

/** Whether the speed between two logins implies impossible travel. */
export function isImpossibleTravel(input: {
  previous: { fingerprint: ILoginFingerprint; occurredAt: string };
  current: { fingerprint: ILoginFingerprint; occurredAt: string };
}): boolean {
  const dist = geoDistanceKm(input.previous.fingerprint, input.current.fingerprint);
  if (dist < NEW_LOCATION_DISTANCE_KM) return false;
  const dtMs =
    new Date(input.current.occurredAt).getTime() - new Date(input.previous.occurredAt).getTime();
  if (dtMs <= 0) return true;
  const hours = dtMs / 3_600_000;
  const kmh = dist / hours;
  return kmh >= IMPOSSIBLE_TRAVEL_KMH;
}

/** Whether the failed-login burst exceeds the per-minute limit. */
export function isFailedBurst(input: {
  recentFailed: { occurredAt: string }[];
  now: string;
}): boolean {
  const cutoff = new Date(input.now).getTime() - FAILED_BURST_WINDOW_MS;
  const within = input.recentFailed.filter((f) => new Date(f.occurredAt).getTime() >= cutoff);
  return within.length >= MAX_FAILED_LOGINS_PER_MIN;
}

/** Whether the UA looks suspicious (very short, missing slash, all-zeros). */
export function isSuspiciousUserAgent(ua: string): boolean {
  if (!ua) return true;
  if (ua.length < 8) return true;
  if (ua === '00000000') return true;
  return false;
}

/** Days since last successful login. */
export function daysSinceLastSuccess(input: {
  history: ILoginHistory;
  now: string;
}): number | null {
  if (!input.history.lastSuccessAt) return null;
  const dtMs = new Date(input.now).getTime() - new Date(input.history.lastSuccessAt).getTime();
  if (dtMs < 0) return 0;
  return Math.floor(dtMs / 86_400_000);
}

/** Decide if the login is anomalous and what action to take. */
export function evaluate(input: ILoginRiskInput): ILoginRiskOutput {
  const reasons: string[] = [];
  let forceMfa = false;
  let forcedOutcome: LoginOutcome | null = null;
  const lastFp = pickLastFingerprint(input.history);
  if (lastFp && !isKnownDevice({ fp: input.fingerprint, history: input.history })) {
    reasons.push('new-device');
    forceMfa = true;
  }
  if (lastFp) {
    if (
      lastFp.countryCode !== input.fingerprint.countryCode ||
      lastFp.regionCode !== input.fingerprint.regionCode
    ) {
      reasons.push('new-location');
      forceMfa = true;
    }
    if (
      isImpossibleTravel({
        previous: { fingerprint: lastFp, occurredAt: input.history.lastSuccessAt ?? input.now },
        current: { fingerprint: input.fingerprint, occurredAt: input.now },
      })
    ) {
      reasons.push('impossible-travel');
      forcedOutcome = 'soft-blocked';
    }
  }
  if (isFailedBurst({ recentFailed: input.recentFailed, now: input.now })) {
    reasons.push('failed-burst');
    forcedOutcome = 'hard-blocked';
  }
  if (isSuspiciousUserAgent(input.fingerprint.userAgent)) {
    reasons.push('suspicious-ua');
    forceMfa = true;
  }
  const days = daysSinceLastSuccess({ history: input.history, now: input.now });
  if (days !== null && days >= 90) {
    reasons.push('inactive-long');
    forceMfa = true;
  }
  return {
    anomalous: reasons.length > 0,
    reasons,
    forcedOutcome,
    forceMfa,
  };
}

function pickLastFingerprint(history: ILoginHistory): ILoginFingerprint | null {
  if (history.recent.length === 0) return null;
  return history.recent[history.recent.length - 1] ?? null;
}

/** Decide the final outcome from policy band + anomaly. */
export function decideOutcome(input: {
  policyAction: LoginOutcome | null;
  anomaly: ILoginRiskOutput;
}): LoginOutcome {
  if (input.anomaly.forcedOutcome) return input.anomaly.forcedOutcome;
  return input.policyAction ?? (input.anomaly.forceMfa ? 'mfa-challenge' : 'success');
}

/** Build the post-attempt history snapshot (pushes the new fp). */
export function pushFingerprint(input: {
  history: ILoginHistory;
  fp: ILoginFingerprint;
  outcome: LoginOutcome;
  now: string;
}): ILoginHistory {
  const next: ILoginFingerprint[] = [...input.history.recent, input.fp];
  while (next.length > MAX_RECENT_FINGERPRINTS) next.shift();
  return {
    actorId: input.history.actorId,
    recent: next,
    failedCountByDay: { ...input.history.failedCountByDay },
    lastSuccessAt:
      input.outcome === 'success' || input.outcome === 'mfa-challenge'
        ? input.now
        : input.history.lastSuccessAt,
  };
}
