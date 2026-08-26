/**
 * BYOK LLM isolation — pure helpers (Stage 66).
 */

import { createHash } from 'node:crypto';

import type {
  ILlmCallAttempt,
  ILlmHealthSnapshot,
  ILlmProviderKey,
  ILlmRoutingDecision,
  ILlmRoutingOptions,
  ILlmUsageRow,
  LlmKeyStatus,
  LlmProvider,
} from './byok-llm.types';
import {
  DEFAULT_HEALTH_MIN_REQUESTS,
  DEFAULT_HEALTH_WINDOW_MS,
  DEFAULT_MIN_REMAINING_TOKENS,
  MAX_LLM_KEYS_PER_ORG,
} from './byok-llm.types';

/** Provider names exposed for enumeration. */
export const ALL_LLM_PROVIDERS: ReadonlyArray<LlmProvider> = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'bedrock',
  'azure',
  'custom',
];

function isProvider(p: string): p is LlmProvider {
  return (ALL_LLM_PROVIDERS as ReadonlyArray<string>).includes(p);
}

function isStatus(s: string): s is LlmKeyStatus {
  return (
    s === 'active' ||
    s === 'rate-limited' ||
    s === 'exhausted' ||
    s === 'disabled' ||
    s === 'invalid'
  );
}

/** Compute a stable fingerprint from the plaintext key (last 4 chars). */
export function fingerprintKey(plaintext: string): string {
  if (!plaintext) return '';
  const trimmed = plaintext.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

/** Generate a deterministic alias from provider + a friendly name. */
export function suggestAlias(input: { provider: LlmProvider; friendlyName: string }): string {
  const slug = input.friendlyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${input.provider}-${slug || 'key'}`;
}

/** Validate an LLM provider key record before persistence. */
export function validateProviderKey(key: ILlmProviderKey): string[] {
  const errs: string[] = [];
  if (!key.id) errs.push('id is required');
  if (!key.orgId) errs.push('orgId is required');
  if (!isProvider(key.provider)) errs.push(`unknown provider: ${key.provider}`);
  if (!key.alias) errs.push('alias is required');
  if (!key.ciphertextRef) errs.push('ciphertextRef is required');
  if (!isStatus(key.status)) errs.push(`unknown status: ${key.status}`);
  if (key.providerTpmCap < 0) errs.push('providerTpmCap must be >= 0');
  if (key.orgDailyCap < 0) errs.push('orgDailyCap must be >= 0');
  return errs;
}

/** Normalize a key record (defaults for isolation/mode, default timestamps). */
export function normalizeProviderKey(
  input: Partial<ILlmProviderKey> & { id: string; orgId: string; provider: LlmProvider }
): ILlmProviderKey {
  const now = new Date().toISOString();
  return {
    id: input.id,
    orgId: input.orgId,
    provider: input.provider,
    alias: input.alias ?? '',
    status: input.status ?? 'active',
    ciphertextRef: input.ciphertextRef ?? '',
    fingerprint: input.fingerprint ?? '',
    verifiedAt: input.verifiedAt ?? null,
    lastUsedAt: input.lastUsedAt ?? null,
    providerTpmCap: input.providerTpmCap ?? 0,
    orgDailyCap: input.orgDailyCap ?? 0,
    isolation: input.isolation ?? 'exclusive',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/** Decide whether adding another key to this org is still allowed. */
export function canRegisterMore(currentCount: number): boolean {
  return currentCount < MAX_LLM_KEYS_PER_ORG;
}

/**
 * Aggregate per-key attempts into one daily usage row.
 * Discards attempts older than the supplied day window.
 */
export function buildUsageRow(input: {
  orgId: string;
  keyId: string;
  provider: LlmProvider;
  day: string;
  attempts: ReadonlyArray<ILlmCallAttempt>;
}): ILlmUsageRow {
  const filtered = input.attempts.filter((a) => a.atIso.startsWith(input.day));
  let tokens = 0;
  let costCents = 0;
  let requests = 0;
  let errors = 0;
  for (const a of filtered) {
    tokens += Math.max(0, Math.floor(a.tokens));
    costCents += Math.max(0, Math.floor(a.costCents));
    requests++;
    if (!a.succeeded) errors++;
  }
  return {
    orgId: input.orgId,
    keyId: input.keyId,
    provider: input.provider,
    day: input.day,
    tokens,
    costCents,
    requests,
    errors,
  };
}

/** Sum usage rows to one org-scoped total. */
export function aggregateOrgUsage(rows: ReadonlyArray<ILlmUsageRow>): ILlmUsageRow {
  if (rows.length === 0) {
    return {
      orgId: '',
      keyId: '',
      provider: 'custom',
      day: '',
      tokens: 0,
      costCents: 0,
      requests: 0,
      errors: 0,
    };
  }
  return rows.reduce<ILlmUsageRow>(
    (acc, r) => ({
      orgId: r.orgId,
      keyId: '',
      provider: r.provider,
      day: r.day,
      tokens: acc.tokens + r.tokens,
      costCents: acc.costCents + r.costCents,
      requests: acc.requests + r.requests,
      errors: acc.errors + r.errors,
    }),
    {
      orgId: rows[0]?.orgId ?? '',
      keyId: '',
      provider: rows[0]?.provider ?? 'custom',
      day: rows[0]?.day ?? '',
      tokens: 0,
      costCents: 0,
      requests: 0,
      errors: 0,
    }
  );
}

/** Compute the rolling-window health snapshot for one key. */
export function computeHealth(input: {
  keyId: string;
  provider: LlmProvider;
  attempts: ReadonlyArray<ILlmCallAttempt>;
  now?: Date;
  windowMs?: number;
  minRequests?: number;
}): ILlmHealthSnapshot {
  const now = input.now ?? new Date();
  const win = input.windowMs ?? DEFAULT_HEALTH_WINDOW_MS;
  const minReq = input.minRequests ?? DEFAULT_HEALTH_MIN_REQUESTS;
  const cutoff = now.getTime() - win;
  const recent = input.attempts.filter((a) => new Date(a.atIso).getTime() >= cutoff);
  const total = recent.length;
  const succeeded = recent.filter((a) => a.succeeded).length;
  const successRate = total === 0 ? 1 : succeeded / total;
  // Median latency proxy: divide elapsed window by request count when known.
  const p50LatencyMs = total === 0 ? 0 : Math.round(win / Math.max(1, total));
  let status: LlmKeyStatus = 'active';
  if (total >= minReq && successRate < 0.5) status = 'invalid';
  else if (total >= minReq && successRate < 0.8) status = 'rate-limited';
  return {
    provider: input.provider,
    keyId: input.keyId,
    status,
    successRate1m: Math.max(0, Math.min(1, successRate)),
    p50LatencyMs,
    quotaRemainingCents: null,
    observedAt: now.toISOString(),
  };
}

/** Select the next usable key for a request, honouring the routing options. */
export function routeRequest(input: {
  orgId: string;
  keys: ReadonlyArray<ILlmProviderKey>;
  usageByKey: Record<string, ILlmUsageRow>;
  options?: ILlmRoutingOptions;
}): ILlmRoutingDecision {
  const opts = input.options ?? {};
  const preferred = opts.preferred ?? [];
  const minRemaining = opts.minRemainingTokens ?? DEFAULT_MIN_REMAINING_TOKENS;
  const allowShared = opts.allowSharedFallback ?? false;
  const ordered = orderCandidates(input.keys, preferred);
  for (const k of ordered) {
    if (k.orgId !== input.orgId) continue;
    if (!isUsable(k, allowShared)) continue;
    const usage = input.usageByKey[k.id];
    if (!usage) {
      return { keyId: k.id, provider: k.provider, reason: 'no usage recorded yet', retry: false };
    }
    if (!hasRemainingBudget(k, usage, minRemaining)) continue;
    return { keyId: k.id, provider: k.provider, reason: 'matched', retry: false };
  }
  return { keyId: null, provider: null, reason: 'no usable key', retry: true };
}

function isUsable(k: ILlmProviderKey, allowShared: boolean): boolean {
  if (k.status === 'disabled' || k.status === 'invalid' || k.status === 'exhausted') return false;
  if (k.isolation === 'shared' && !allowShared) return false;
  return true;
}

function hasRemainingBudget(
  k: ILlmProviderKey,
  usage: ILlmUsageRow,
  minRemaining: number
): boolean {
  if (k.orgDailyCap <= 0) return true;
  const used = usage.tokens;
  if (used >= k.orgDailyCap) return false;
  if (k.orgDailyCap - used < minRemaining) return false;
  return true;
}

function orderCandidates(
  keys: ReadonlyArray<ILlmProviderKey>,
  preferred: ReadonlyArray<LlmProvider>
): ILlmProviderKey[] {
  const prefSet = new Map(preferred.map((p, i) => [p, i]));
  return [...keys].sort((a, b) => {
    const ap = prefSet.has(a.provider) ? prefSet.get(a.provider) ?? 0 : preferred.length + 1;
    const bp = prefSet.has(b.provider) ? prefSet.get(b.provider) ?? 0 : preferred.length + 1;
    if (ap !== bp) return ap - bp;
    if (a.isolation !== b.isolation) return a.isolation === 'exclusive' ? -1 : 1;
    return a.alias.localeCompare(b.alias);
  });
}

/** Hash a token report for tamper-evident audit logs. */
export function hashAttempt(attempt: ILlmCallAttempt): string {
  return createHash('sha256')
    .update(
      `${attempt.orgId}|${attempt.keyId}|${attempt.provider}|${attempt.tokens}|${attempt.costCents}|${attempt.succeeded ? 1 : 0}|${attempt.atIso}`
    )
    .digest('hex')
    .slice(0, 24);
}

/** Whether the key should be flipped to "exhausted" based on usage. */
export function shouldMarkExhausted(input: {
  key: ILlmProviderKey;
  usage: ILlmUsageRow | null;
}): boolean {
  if (!input.usage) return false;
  if (input.key.orgDailyCap <= 0) return false;
  return input.usage.tokens >= input.key.orgDailyCap;
}

export const testHelpers = { isProvider, isStatus, orderCandidates };
