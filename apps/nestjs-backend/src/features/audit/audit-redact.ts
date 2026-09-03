/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Audit metadata redaction (R53).
 *
 * Pure, dependency-free redactor that scrubs known sensitive patterns from
 * audit event payloads / params before they hit the durable audit table.
 * Operates on any JSON-shaped value (objects / arrays / primitives).
 *
 * Rules (redact by key-name OR by value-pattern):
 *   - Key name match (case-insensitive): password, passwd, secret, token,
 *     apiKey, api_key, authorization, cookie, session, csrf, privateKey,
 *     private_key, signature, refreshToken, refresh_token, accessToken,
 *     access_token, clientSecret, client_secret
 *   - Value patterns:
 *       - JWT (3 base64url segments)
 *       - Bearer <token>
 *       - AWS access key (AKIA / ASIA prefix, 16-20 chars)
 *       - GitHub PAT (ghp_ / gho_ / ghu_ / ghs_ / ghr_ prefix)
 *       - Slack token (xox[bpars]-...)
 *       - Email (RFC 5322 lite)
 *       - Phone (E.164 lite, optional + prefix)
 *       - Credit-card-like (13-19 digits, Luhn-passing optional)
 *
 * Redacted values become the literal string "[REDACTED]" (or a custom
 * marker). Keys whose value is replaced keep the original key name so
 * downstream consumers still see `password: "[REDACTED]"` in the row.
 *
 * Deterministic: same input -> same output. Safe for replay testing.
 *
 * License: AGPL-3.0
 */

export const REDACTED_MARKER = '[REDACTED]';

/** Key names that always redact (case-insensitive, substring match). */
export const SENSITIVE_KEY_PATTERNS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'session',
  'csrf',
  'privatekey',
  'private_key',
  'signature',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'clientsecret',
  'client_secret',
  'bearertoken',
  'bearer',
];

// NOTE: Do NOT use `g` flag here -- `.test()` with `g` is stateful (lastIndex persists).
// These are pure predicates; full-string match only. Use a separate scan() helper if
// substring detection is needed.
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BEARER_RE = /^Bearer\s+[A-Za-z0-9._\-+/=]{8,}$/;
const AWS_ACCESS_KEY_RE = /(?:AKIA|ASIA)[0-9A-Z]{16}/;
const GITHUB_PAT_RE = /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/;
const SLACK_TOKEN_RE = /xox[bpars]-[A-Za-z0-9-]{10,}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_E164_RE = /\+?[1-9]\d{9,14}/;
const CC_RE = /(?:\d[ -]?){12,18}\d/;

/** Compiled key-name predicate. */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-]/g, '_');
  return SENSITIVE_KEY_PATTERNS.some((p) => lower === p || lower.includes(p));
}

/** Whether a string value matches a known sensitive pattern. */
export function isSensitiveValue(value: string): boolean {
  if (JWT_RE.test(value)) return true;
  if (BEARER_RE.test(value)) return true;
  if (AWS_ACCESS_KEY_RE.test(value)) return true;
  if (GITHUB_PAT_RE.test(value)) return true;
  if (SLACK_TOKEN_RE.test(value)) return true;
  // Email / phone / CC are PII but not necessarily secret. Caller decides
  // via `redactPii` flag whether to mask them.
  return false;
}

/** Whether a string value looks like PII (email / phone / credit card). */
export function isPiiValue(value: string): boolean {
  if (EMAIL_RE.test(value)) return true;
  if (PHONE_E164_RE.test(value)) return true;
  if (CC_RE.test(value)) return true;
  return false;
}

export interface IRedactOptions {
  /** When true, also redact email / phone / credit-card values. */
  redactPii?: boolean;
  /** Marker substituted in place of sensitive values. */
  marker?: string;
}

export interface IRedactionReport {
  /** Number of key-name redactions. */
  keysRedacted: number;
  /** Number of value-pattern redactions. */
  valuesRedacted: number;
  /** Number of PII redactions (when redactPii=true). */
  piiRedacted: number;
}

/**
 * Redact sensitive values from an arbitrary JSON-shaped value. Returns a
 * structurally identical copy (with redactions applied) and a report.
 * Original input is NOT mutated.
 */
export function redactAuditValue(
  value: unknown,
  options: IRedactOptions = {},
  report: IRedactionReport = { keysRedacted: 0, valuesRedacted: 0, piiRedacted: 0 }
): unknown {
  const marker = options.marker ?? REDACTED_MARKER;

  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactAuditValue(v, options, report));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = marker;
        report.keysRedacted += 1;
        continue;
      }
      out[k] = redactAuditValue(v, options, report);
    }
    return out;
  }

  if (typeof value === 'string') {
    if (isSensitiveValue(value)) {
      report.valuesRedacted += 1;
      return marker;
    }
    if (options.redactPii && isPiiValue(value)) {
      report.piiRedacted += 1;
      return marker;
    }
    return value;
  }

  return value;
}

/** Convenience: redact audit payload + params in one call. */
export function redactAuditMetadata(
  input: { payload?: Record<string, unknown>; params?: Record<string, unknown> } | undefined,
  options: IRedactOptions = {}
): { payload: Record<string, unknown> | undefined; params: Record<string, unknown> | undefined; report: IRedactionReport } {
  const report: IRedactionReport = { keysRedacted: 0, valuesRedacted: 0, piiRedacted: 0 };
  const payload = input?.payload
    ? (redactAuditValue(input.payload, options, report) as Record<string, unknown>)
    : input?.payload;
  const params = input?.params
    ? (redactAuditValue(input.params, options, report) as Record<string, unknown>)
    : input?.params;
  return { payload, params, report };
}
