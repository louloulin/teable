/**
 * Integration Connector — Stage 33.
 *
 * Pure helpers for the public connector registry + catch-hook
 * payload signing and delivery deduplication.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';

import type {
  ICreateInstallInput,
  IIntegrationProvider,
  IUpdateInstallInput,
  InstallStatus,
} from './integration-connector.types';
import { SUPPORTED_PROVIDERS } from './integration-connector.types';

const PROVIDER_CODE_REGEX = /^[a-z][a-z0-9-]{1,31}$/;

export function isValidProviderCode(code: string): boolean {
  return PROVIDER_CODE_REGEX.test(code);
}

/** Look up a static provider from the bundled catalog. */
export function resolveBundledProvider(code: string): (typeof SUPPORTED_PROVIDERS)[number] | null {
  return SUPPORTED_PROVIDERS.find((p) => p.code === code) ?? null;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export function hashPayload(payload: string | Record<string, unknown>): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(body).digest('hex');
}

export function signCatchHook(input: {
  secret: string;
  timestamp: number;
  payload: string;
}): string {
  const v1 = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.payload}`)
    .digest('hex');
  return `t=${input.timestamp},v1=${v1}`;
}

export function verifyCatchHookSignature(input: {
  header: string | null | undefined;
  secret: string;
  payload: string;
  now?: number;
  maxDriftSeconds?: number;
}): { valid: boolean; reason: 'missing' | 'malformed' | 'too-old' | 'mismatch' | null } {
  if (!input.header) return { valid: false, reason: 'missing' };
  const m = /^t=(\d+),v1=([a-f0-9]+)/.exec(input.header);
  if (!m) return { valid: false, reason: 'malformed' };
  const t = Number.parseInt(m[1], 10);
  const v1 = m[2];
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const drift = input.maxDriftSeconds ?? 5 * 60;
  if (Math.abs(now - t) > drift) return { valid: false, reason: 'too-old' };
  const expected = createHmac('sha256', input.secret).update(`${t}.${input.payload}`).digest('hex');
  if (expected.length !== v1.length) return { valid: false, reason: 'mismatch' };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0 ? { valid: true, reason: null } : { valid: false, reason: 'mismatch' };
}

export function isValidInstallStatusTransition(from: InstallStatus, to: InstallStatus): boolean {
  const allow: Record<InstallStatus, ReadonlyArray<InstallStatus>> = {
    pending: ['active', 'error', 'revoked'],
    active: ['expired', 'revoked', 'error'],
    expired: ['active', 'revoked'],
    revoked: [],
    error: ['active', 'revoked'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function buildInstallRow(
  input: ICreateInstallInput & { id: string; webhookSecret?: string | null; now?: Date }
): {
  id: string;
  organizationId: string;
  providerCode: string;
  status: InstallStatus;
  externalAccountId: string | null;
  accessTokenJson: string | null;
  refreshToken: string | null;
  scopesCsv: string | null;
  webhookSecret: string | null;
  expiresAt: Date | null;
  installedBy: string;
  installedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
} {
  return {
    id: input.id,
    organizationId: input.organizationId,
    providerCode: input.providerCode,
    status: 'active',
    externalAccountId: input.externalAccountId ?? null,
    accessTokenJson: input.accessTokenJson ?? null,
    refreshToken: input.refreshToken ?? null,
    scopesCsv: input.scopesCsv ?? null,
    webhookSecret: input.webhookSecret ?? null,
    expiresAt: input.expiresAt ?? null,
    installedBy: input.installedBy,
    installedTime: input.now ?? new Date(),
    updatedTime: input.now ?? new Date(),
    revokedAt: null,
  };
}

export function applyInstallUpdate(
  row: {
    status: InstallStatus;
    accessTokenJson: string | null;
    refreshToken: string | null;
    scopesCsv: string | null;
    expiresAt: Date | null;
    externalAccountId: string | null;
    revokedAt: Date | null;
  },
  update: IUpdateInstallInput
): typeof row & { updatedTime: Date } {
  return {
    ...row,
    status: update.status ?? row.status,
    accessTokenJson:
      update.accessTokenJson !== undefined ? update.accessTokenJson : row.accessTokenJson,
    refreshToken: update.refreshToken !== undefined ? update.refreshToken : row.refreshToken,
    scopesCsv: update.scopesCsv !== undefined ? update.scopesCsv : row.scopesCsv,
    expiresAt: update.expiresAt !== undefined ? update.expiresAt : row.expiresAt,
    externalAccountId:
      update.externalAccountId !== undefined ? update.externalAccountId : row.externalAccountId,
    updatedTime: new Date(),
  };
}

/** Build the catch-hook URL that a third party (Zapier/Make) would POST to. */
export function buildCatchHookUrl(input: { baseUrl: string; installId: string }): string {
  const base = input.baseUrl.replace(/\/$/, '');
  return `${base}/api/integrations/catch-hook/${input.installId}`;
}

/** Decide whether a delivery should be deduplicated vs processed. */
export function isDuplicateDelivery(input: {
  seen: Set<string>;
  payloadHash: string;
  windowMs?: number;
  now?: number;
  lastSeenAt?: number | null;
}): boolean {
  if (input.seen.has(input.payloadHash)) return true;
  // Window-based dedup: if same hash within windowMs, treat as duplicate.
  if (input.lastSeenAt) {
    const now = input.now ?? Date.now();
    if (now - input.lastSeenAt < (input.windowMs ?? 60_000)) return true;
  }
  return false;
}

/** Resolve provider from registered providers or fallback to bundled catalog. */
export function resolveProvider(input: {
  code: string;
  registered: IIntegrationProvider | null;
}): IIntegrationProvider | null {
  if (input.registered) return input.registered;
  const bundled = resolveBundledProvider(input.code);
  if (!bundled) return null;
  return {
    id: `prov_${bundled.code}`,
    code: bundled.code,
    displayName: bundled.displayName,
    category: bundled.category,
    authType: bundled.authType,
    webhookStyle: bundled.webhookStyle,
    description: bundled.description,
    docsUrl: bundled.docsUrl,
    enabled: true,
    createdTime: new Date(0),
  };
}
