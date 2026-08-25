/**
 * Org-level quota orchestration — pure helpers (Stage 65).
 */

import type {
  GrantDecision,
  IFairnessState,
  IOrgQuotaCheckResult,
  IOrgQuotaEnvelope,
  IOrgQuotaOverage,
  IOrgQuotaOptions,
  IOrgQuotaUsage,
  OveragePolicy,
  QuotaKind,
} from './org-quota.types';
import {
  DEFAULT_ORG_SOFT_FRACTION,
  FAIRNESS_BOOST,
  FAIRNESS_DECAY,
  MAX_ORG_QUOTA_KINDS,
} from './org-quota.types';

/**
 * Normalize a cap map: drop unknown kinds, coerce numbers to bigint so
 * large attachments do not lose precision.
 */
export function normalizeEnvelope(env: IOrgQuotaEnvelope): IOrgQuotaEnvelope {
  const out: IOrgQuotaEnvelope = {
    orgId: env.orgId,
    caps: {},
    policy: env.policy,
    softFraction: clampSoft(env.softFraction),
    windowSeconds: env.windowSeconds,
    ...(env.notes ? { notes: env.notes } : {}),
  };
  for (const [k, v] of Object.entries(env.caps)) {
    if (!isQuotaKind(k)) continue;
    if (v === null) {
      out.caps[k] = null;
    } else if (typeof v === 'bigint') {
      out.caps[k] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.caps[k] = v;
    }
  }
  return out;
}

function clampSoft(fraction: number): number {
  if (!Number.isFinite(fraction)) return DEFAULT_ORG_SOFT_FRACTION;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 0.99;
  return fraction;
}

function isQuotaKind(s: string): s is QuotaKind {
  return (
    s === 'rows' ||
    s === 'automationRuns' ||
    s === 'aiCredits' ||
    s === 'attachmentBytes' ||
    s === 'apiCallsPerMinute'
  );
}

/** Validate an envelope; returns the list of violation messages. */
export function validateEnvelope(env: IOrgQuotaEnvelope): string[] {
  const errs: string[] = [];
  if (!env.orgId) errs.push('orgId is required');
  if (!isPolicy(env.policy)) errs.push(`unknown policy: ${env.policy}`);
  if (
    env.windowSeconds !== null &&
    (typeof env.windowSeconds !== 'number' || env.windowSeconds <= 0)
  ) {
    errs.push('windowSeconds must be a positive number or null');
  }
  const n = Object.keys(env.caps).length;
  if (n > MAX_ORG_QUOTA_KINDS) {
    errs.push(`too many quota kinds (${n} > ${MAX_ORG_QUOTA_KINDS})`);
  }
  for (const [k, v] of Object.entries(env.caps)) {
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      errs.push(`cap for ${k} must be a finite number or null`);
    }
  }
  return errs;
}

function isPolicy(p: string): p is OveragePolicy {
  return p === 'hard' || p === 'soft' || p === 'queue';
}

/** Compute the remaining cap. */
export function computeRemaining(
  cap: number | bigint | null,
  used: number
): number | bigint | null {
  if (cap === null) return null;
  const capN = typeof cap === 'bigint' ? cap : BigInt(cap);
  const usedN = BigInt(Math.max(0, Math.floor(used)));
  const rem = capN - usedN;
  if (rem < 0n) return 0n;
  return rem;
}

/**
 * Decide whether a per-org request can be granted given the current
 * envelope and observed usage. The decision tree:
 *
 *   cap === null  → allow (unlimited)
 *   policy=hard  → deny if used, request >= cap, else allow
 *   policy=soft  → allow under softFraction; throttle between soft and 100;
 *                  deny over 100.
 *   policy=queue → allow under cap; queue when over until next window.
 */
export function decideQuota(input: {
  envelope: IOrgQuotaEnvelope;
  usage: IOrgQuotaUsage;
  requested: number;
}): IOrgQuotaCheckResult {
  const { envelope, usage } = input;
  const cap = envelope.caps[usage.kind] ?? null;
  if (cap === null) {
    return {
      orgId: envelope.orgId,
      kind: usage.kind,
      decision: 'allow',
      atCap: false,
      remaining: null,
    };
  }
  const capN = typeof cap === 'bigint' ? cap : BigInt(cap);
  const usedN = BigInt(Math.max(0, Math.floor(usage.used)));
  const reqN = BigInt(Math.max(0, Math.floor(input.requested)));
  const projected = usedN + reqN;
  const remaining = capN - usedN;
  if (projected <= capN) {
    return {
      orgId: envelope.orgId,
      kind: usage.kind,
      decision: 'allow',
      atCap: false,
      remaining: remaining < 0n ? 0n : remaining,
    };
  }
  if (envelope.policy === 'hard') {
    return {
      orgId: envelope.orgId,
      kind: usage.kind,
      decision: 'deny',
      atCap: true,
      remaining: 0n,
      reason: 'org cap reached (hard policy)',
    };
  }
  if (envelope.policy === 'queue') {
    return {
      orgId: envelope.orgId,
      kind: usage.kind,
      decision: 'queue',
      atCap: true,
      remaining: 0n,
      reason: 'org cap reached (queued)',
    };
  }
  // soft policy: throttle whenever usage is above the soft band, regardless
  // of how far over the hard cap the projection lands. Soft policy never
  // denies outright — it relies on the request interceptor to apply back-off.
  return {
    orgId: envelope.orgId,
    kind: usage.kind,
    decision: 'throttle',
    atCap: true,
    remaining: 0n,
    reason: 'org cap exceeded (soft policy: throttle)',
  };
}

/** Record an overage event (pure helper; caller persists). */
export function buildOverage(input: {
  envelope: IOrgQuotaEnvelope;
  baseId: string;
  kind: QuotaKind;
  requested: number;
  decision: GrantDecision;
  now?: Date;
}): IOrgQuotaOverage {
  const now = input.now ?? new Date();
  const reason = reasonFor(input.decision, input.envelope.policy);
  return {
    orgId: input.envelope.orgId,
    kind: input.kind,
    baseId: input.baseId,
    attemptedAt: now.toISOString(),
    requestedUnits: Math.max(0, Math.floor(input.requested)),
    decision: input.decision,
    reason,
  };
}

function reasonFor(decision: GrantDecision, policy: OveragePolicy): string {
  if (decision === 'allow') return 'granted';
  if (decision === 'throttle') return `throttled (${policy})`;
  if (decision === 'queue') return `queued (${policy})`;
  return `denied (${policy})`;
}

/** Pick the next base to grant when multiple are competing. */
export function pickNextBase(
  state: IFairnessState,
  candidates: ReadonlyArray<string>
): string | null {
  if (candidates.length === 0) return null;
  let best: { baseId: string; score: number } | null = null;
  const now = Date.now();
  for (const id of candidates) {
    const deficit = state.deficits[id] ?? 0;
    const lastGrant = state.lastGrantByBase[id];
    const recency = lastGrant ? (now - new Date(lastGrant).getTime()) / 1000 : 0;
    const score = deficit * FAIRNESS_BOOST + recency * 0.01;
    if (!best || score > best.score) {
      best = { baseId: id, score };
    }
  }
  return best?.baseId ?? null;
}

/** Update the fairness ledger with the outcome of one grant decision. */
export function applyGrant(input: {
  state: IFairnessState;
  baseId: string;
  decision: GrantDecision;
  units: number;
  now?: Date;
}): IFairnessState {
  const now = (input.now ?? new Date()).toISOString();
  const deficits = { ...input.state.deficits };
  const last = { ...input.state.lastGrantByBase };
  if (input.decision === 'allow') {
    deficits[input.baseId] = 0;
    last[input.baseId] = now;
    return {
      ...input.state,
      deficits,
      lastGrantByBase: last,
      totalGrants: input.state.totalGrants + 1,
    };
  }
  if (input.decision === 'queue') {
    deficits[input.baseId] = (deficits[input.baseId] ?? 0) + input.units;
    return { ...input.state, deficits };
  }
  // throttle or deny: also bump deficit so fairness picks this base next.
  deficits[input.baseId] = (deficits[input.baseId] ?? 0) + input.units;
  return { ...input.state, deficits };
}

/** Initial empty fairness state for a fresh org. */
export function emptyFairnessState(orgId: string): IFairnessState {
  return {
    orgId,
    deficits: {},
    lastGrantByBase: {},
    totalGrants: 0,
  };
}

/** Apply time decay so old deficits don't pin forever. */
export function decayFairness(state: IFairnessState, now: Date = new Date()): IFairnessState {
  const nowTs = now.getTime();
  const deficits: Record<string, number> = {};
  for (const [baseId, deficit] of Object.entries(state.deficits)) {
    const last = state.lastGrantByBase[baseId];
    const ageSec = last ? (nowTs - new Date(last).getTime()) / 1000 : 0;
    const decay = Math.pow(FAIRNESS_DECAY, Math.max(0, ageSec) / 60);
    const decayed = deficit * decay;
    if (decayed >= 0.001) deficits[baseId] = decayed;
  }
  return { ...state, deficits };
}

/** Compute aggregate usage across bases for one org. */
export function aggregateUsage(input: {
  orgId: string;
  kind: QuotaKind;
  perBaseUsed: ReadonlyArray<{ baseId: string; used: number }>;
  windowStart: string;
  windowEnd: string;
}): IOrgQuotaUsage {
  const used = input.perBaseUsed.reduce((s, b) => s + Math.max(0, Math.floor(b.used)), 0);
  return {
    orgId: input.orgId,
    kind: input.kind,
    used,
    cap: null,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  };
}

export function applyOptions(state: IFairnessState, opts: IOrgQuotaOptions): IFairnessState {
  if (!opts.candidateBaseIds) return state;
  const filtered: Record<string, number> = {};
  for (const id of opts.candidateBaseIds) {
    if (state.deficits[id] !== undefined) filtered[id] = state.deficits[id];
  }
  const lastFiltered: Record<string, string> = {};
  for (const id of opts.candidateBaseIds) {
    if (state.lastGrantByBase[id] !== undefined) {
      lastFiltered[id] = state.lastGrantByBase[id] ?? '';
    }
  }
  return { ...state, deficits: filtered, lastGrantByBase: lastFiltered };
}

export const testHelpers = { isQuotaKind, clampSoft };
