/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import {
  REDACTED_MARKER,
  isPiiValue,
  isSensitiveValue,
  redactAuditMetadata,
  redactAuditValue,
} from './audit-redact';

describe('audit-redact.isSensitiveKey (via redactAuditValue)', () => {
  it('redacts exact key "password"', () => {
    const out = redactAuditValue({ password: 'hunter2' });
    expect(out).toEqual({ password: REDACTED_MARKER });
  });

  it('redacts camelCase variants: apiKey, refreshToken, accessToken', () => {
    const out = redactAuditValue({ apiKey: 'k', refreshToken: 'r', accessToken: 'a' });
    expect(out).toEqual({ apiKey: REDACTED_MARKER, refreshToken: REDACTED_MARKER, accessToken: REDACTED_MARKER });
  });

  it('redacts snake_case variants: api_key, client_secret', () => {
    const out = redactAuditValue({ api_key: 'k', client_secret: 's' });
    expect(out).toEqual({ api_key: REDACTED_MARKER, client_secret: REDACTED_MARKER });
  });

  it('is case-insensitive: PASSWORD, ApiKey, Authorization', () => {
    const out = redactAuditValue({ PASSWORD: '1', ApiKey: '2', Authorization: '3' });
    expect(out).toEqual({ PASSWORD: REDACTED_MARKER, ApiKey: REDACTED_MARKER, Authorization: REDACTED_MARKER });
  });

  it('redacts nested keys: outer.user.password', () => {
    const out = redactAuditValue({ outer: { user: { password: '1', name: 'alice' } } });
    expect(out).toEqual({ outer: { user: { password: REDACTED_MARKER, name: 'alice' } } });
  });

  it('redacts the whole array when key name is sensitive (tokens, secrets)', () => {
    const out = redactAuditValue({ tokens: ['secret-a', 'plain'] });
    expect(out).toEqual({ tokens: REDACTED_MARKER });
  });

  it('counts keysRedacted in the report', () => {
    const report = { keysRedacted: 0, valuesRedacted: 0, piiRedacted: 0 };
    redactAuditValue({ password: 'x', token: 'y', name: 'alice' }, {}, report);
    expect(report.keysRedacted).toBe(2);
  });
});

describe('audit-redact.isSensitiveValue', () => {
  it('detects JWT (3 base64url segments)', () => {
    expect(isSensitiveValue('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')).toBe(true);
  });

  it('detects Bearer token', () => {
    expect(isSensitiveValue('Bearer abcdefghijklmnop')).toBe(true);
  });

  it('detects AWS access key', () => {
    expect(isSensitiveValue('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    expect(isSensitiveValue('ASIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('detects GitHub PAT', () => {
    expect(isSensitiveValue('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789')).toBe(true);
  });

  it('detects Slack token', () => {
    expect(isSensitiveValue('xoxb-12345-67890-abcdefghij')).toBe(true);
  });

  it('does not flag plain words', () => {
    expect(isSensitiveValue('hello world')).toBe(false);
    expect(isSensitiveValue('alice')).toBe(false);
  });

  it('redacts inline secrets when a known token prefix appears anywhere in the string (safer over-redaction)', () => {
    const out = redactAuditValue({ note: 'leaked token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 ok' });
    // The token prefix matcher matches anywhere in the string -> the whole value
    // is replaced. This is intentionally over-cautious: false positives are cheaper
    // than secret leakage in audit logs.
    expect(out).toEqual({ note: REDACTED_MARKER });
    expect(out.note).toBe(REDACTED_MARKER);
  });
});

describe('audit-redact.isPiiValue', () => {
  it('detects email', () => {
    expect(isPiiValue('alice@example.com')).toBe(true);
  });

  it('detects E.164 phone', () => {
    expect(isPiiValue('+14155552671')).toBe(true);
  });

  it('detects credit-card-like number (13-19 digits)', () => {
    expect(isPiiValue('4111111111111111')).toBe(true);
    expect(isPiiValue('4111-1111-1111-1111')).toBe(true);
  });

  it('does not flag short numbers', () => {
    expect(isPiiValue('12345')).toBe(false);
  });
});

describe('audit-redact.redactAuditValue with redactPii flag', () => {
  it('does not redact PII by default', () => {
    const out = redactAuditValue({ email: 'alice@example.com' });
    expect(out).toEqual({ email: 'alice@example.com' });
  });

  it('redacts email when redactPii=true', () => {
    const out = redactAuditValue({ email: 'alice@example.com' }, { redactPii: true });
    expect(out).toEqual({ email: REDACTED_MARKER });
  });

  it('uses custom marker', () => {
    const out = redactAuditValue({ password: 'x' }, { marker: '<hidden>' });
    expect(out).toEqual({ password: '<hidden>' });
  });
});

describe('audit-redact.redactAuditMetadata (audit emit entry point)', () => {
  it('redacts payload + params together', () => {
    const { payload, params, report } = redactAuditMetadata({
      payload: { action: 'create', password: 'x' },
      params: { token: 'y', foo: 'bar' },
    });
    expect(payload).toEqual({ action: 'create', password: REDACTED_MARKER });
    expect(params).toEqual({ token: REDACTED_MARKER, foo: 'bar' });
    expect(report.keysRedacted).toBe(2);
  });

  it('handles undefined input', () => {
    const { payload, params, report } = redactAuditMetadata(undefined);
    expect(payload).toBeUndefined();
    expect(params).toBeUndefined();
    expect(report.keysRedacted).toBe(0);
  });

  it('does not mutate the original input', () => {
    const original = { payload: { password: 'x' }, params: { token: 'y' } };
    const snapshot = JSON.parse(JSON.stringify(original));
    redactAuditMetadata(original);
    expect(original).toEqual(snapshot);
  });

  it('redacts SAML token passed as raw value in payload', () => {
    const { payload, report } = redactAuditMetadata({
      payload: { samlResponse: 'Bearer abcdefghijklmnop' },
    });
    expect(payload!.samlResponse).toBe(REDACTED_MARKER);
    expect(report.valuesRedacted).toBe(1);
  });

  it('redacts GitHub PAT in params when redactPii=true (PII path does not match; secret pattern does)', () => {
    const { params, report } = redactAuditMetadata({
      params: { note: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789' },
    });
    expect(params!.note).toBe(REDACTED_MARKER);
    expect(report.valuesRedacted).toBe(1);
  });

  it('redacts nested PII email when redactPii=true', () => {
    const { payload, report } = redactAuditMetadata({
      payload: { user: { email: 'alice@example.com', name: 'alice' } },
    }, { redactPii: true });
    expect(payload).toEqual({ user: { email: REDACTED_MARKER, name: 'alice' } });
    expect(report.piiRedacted).toBe(1);
  });

  it('preserves non-sensitive nested structure', () => {
    const { payload } = redactAuditMetadata({
      payload: { table: { id: 'tbl1', name: 'Customers', fields: ['name', 'email'] } },
    });
    expect(payload).toEqual({ table: { id: 'tbl1', name: 'Customers', fields: ['name', 'email'] } });
  });
});

describe('audit-redact edge cases', () => {
  it('handles null and undefined primitives', () => {
    expect(redactAuditValue(null)).toBeNull();
    expect(redactAuditValue(undefined)).toBeUndefined();
  });

  it('handles empty object', () => {
    expect(redactAuditValue({})).toEqual({});
  });

  it('handles empty array', () => {
    expect(redactAuditValue([])).toEqual([]);
  });

  it('handles numbers and booleans', () => {
    expect(redactAuditValue(42)).toBe(42);
    expect(redactAuditValue(true)).toBe(true);
  });

  it('is deterministic across repeated calls', () => {
    const input = { password: 'x', nested: { token: 'y' } };
    expect(redactAuditValue(input)).toEqual(redactAuditValue(input));
  });
});
