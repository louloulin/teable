/**
 * SDK platform — Stage 38.
 *
 * Pure helpers: client-id minting, secret hashing, token format,
 * scope parsing, and usage log aggregation.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  IMintTokenInput,
  IRecordUsageInput,
  IRegisterAppInput,
  SdkChannel,
  SdkLanguage,
  SdkOutcome,
  SdkTokenStatus,
} from './sdk-platform.types';
import {
  DEFAULT_TOKEN_PREFIX,
  SUPPORTED_CHANNELS,
  SUPPORTED_LANGUAGES,
} from './sdk-platform.types';

const CLIENT_ID_REGEX = /^[A-Z0-9]{12,32}$/;
const SECRET_REGEX = /^sdk_sk_[A-Za-z0-9]{32,64}$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;

export function isValidClientId(clientId: string): boolean {
  return CLIENT_ID_REGEX.test(clientId);
}

export function isValidLanguage(lang: string): lang is SdkLanguage {
  return (SUPPORTED_LANGUAGES as ReadonlyArray<string>).includes(lang);
}

export function isValidChannel(channel: string): channel is SdkChannel {
  return (SUPPORTED_CHANNELS as ReadonlyArray<string>).includes(channel);
}

export function isValidSecretFormat(secret: string): boolean {
  return SECRET_REGEX.test(secret);
}

export function isValidVersion(version: string): boolean {
  return VERSION_REGEX.test(version);
}

export function generateClientId(): string {
  // Crockford-style uppercase, 16 chars from [0-9A-HJKMNP-TV-Z] excluding 0/O/1/I/L.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const buf = randomBytes(16);
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}

export function generateClientSecret(): string {
  return `sdk_sk_${randomBytes(32).toString('hex')}`;
}

export function generateApiToken(): string {
  return `${DEFAULT_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function parseScopes(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function stringifyScopes(scopes: ReadonlyArray<string>): string {
  return Array.from(new Set(scopes.map((s) => s.trim()).filter((s) => s.length > 0))).join(',');
}

/** Determine if a token has any scope in common with the requested set. */
export function tokenHasAnyScope(input: {
  tokenScopesCsv: string;
  required: ReadonlyArray<string>;
}): boolean {
  if (input.required.length === 0) return true;
  const owned = new Set(parseScopes(input.tokenScopesCsv));
  return input.required.some((s) => owned.has(s));
}

export function tokenLastFour(plaintext: string): string {
  return plaintext.slice(-8);
}

export function buildAppRow(
  input: IRegisterAppInput & { id: string; clientId: string; clientSecretHash?: string | null }
): {
  id: string;
  organizationId: string;
  name: string;
  language: SdkLanguage;
  homepageUrl: string | null;
  redirectUrl: string | null;
  scopesCsv: string;
  clientId: string;
  clientSecretHash: string | null;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
} {
  return {
    id: input.id,
    organizationId: input.organizationId,
    name: input.name,
    language: input.language,
    homepageUrl: input.homepageUrl ?? null,
    redirectUrl: input.redirectUrl ?? null,
    scopesCsv: input.scopesCsv,
    clientId: input.clientId,
    clientSecretHash: input.clientSecretHash ?? null,
    description: input.description ?? null,
    enabled: true,
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
    revokedAt: null,
  };
}

export function isTokenExpired(input: { now?: Date; expiresAt: Date | null }): boolean {
  if (!input.expiresAt) return false;
  const now = input.now ?? new Date();
  return input.expiresAt.getTime() <= now.getTime();
}

export function isValidTokenStatusTransition(from: SdkTokenStatus, to: SdkTokenStatus): boolean {
  const allow: Record<SdkTokenStatus, ReadonlyArray<SdkTokenStatus>> = {
    active: ['expired', 'revoked'],
    expired: ['revoked'],
    revoked: [],
  };
  return allow[from]?.includes(to) ?? false;
}

export function buildTokenRow(
  input: IMintTokenInput & {
    id: string;
    tokenHash: string;
    tokenLastFour: string;
  }
): {
  id: string;
  appId: string;
  organizationId: string;
  userId: string | null;
  label: string;
  tokenHash: string;
  tokenLastFour: string;
  scopesCsv: string;
  status: SdkTokenStatus;
  createdBy: string;
  createdTime: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
} {
  return {
    id: input.id,
    appId: input.appId,
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    label: input.label,
    tokenHash: input.tokenHash,
    tokenLastFour: input.tokenLastFour,
    scopesCsv: input.scopesCsv,
    status: 'active',
    createdBy: input.createdBy,
    createdTime: new Date(),
    lastUsedAt: null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
  };
}

export interface IUsageAggregate {
  total: number;
  byOutcome: Record<SdkOutcome, number>;
  averageDurationMs: number;
  p95DurationMs: number;
  bytesIn: number;
  bytesOut: number;
}

export function foldUsage(
  records: ReadonlyArray<IRecordUsageInput & { id?: string; occurredAt?: Date }>
): IUsageAggregate {
  const byOutcome: Record<SdkOutcome, number> = {
    ok: 0,
    'rate-limited': 0,
    unauthorized: 0,
    error: 0,
  };
  let totalDuration = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  const durations: number[] = [];
  for (const r of records) {
    byOutcome[r.outcome] += 1;
    totalDuration += r.durationMs;
    durations.push(r.durationMs);
    bytesIn += r.bytesIn ?? 0;
    bytesOut += r.bytesOut ?? 0;
  }
  durations.sort((a, b) => a - b);
  const p95 =
    durations.length === 0
      ? 0
      : durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
  return {
    total: records.length,
    byOutcome,
    averageDurationMs: records.length === 0 ? 0 : Math.round(totalDuration / records.length),
    p95DurationMs: p95,
    bytesIn,
    bytesOut,
  };
}

export function isValidOutcome(outcome: string): outcome is SdkOutcome {
  return (
    outcome === 'ok' ||
    outcome === 'rate-limited' ||
    outcome === 'unauthorized' ||
    outcome === 'error'
  );
}
