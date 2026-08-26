/**
 * Domain-verification — thin-DI wrapper helpers (Stage 130).
 *
 * Pure string helpers for normalizing domain names and joining TXT
 * record chunks. No Nest DI surface.
 */

import type { IParsedTxtRecord } from './domain-verification.types';

/** Lower-case + trim a domain. Returns null when input is empty. */
export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(trimmed)) return null;
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null;
  return trimmed;
}

/** Parse a single TXT record string (may itself be a chunked array). */
export function parseTxtRecord(input: string | ReadonlyArray<string>): IParsedTxtRecord {
  const chunks = Array.isArray(input) ? input : [input];
  const quoted = chunks.length > 0 && chunks.every((c) => c.startsWith('"') && c.endsWith('"'));
  const value = chunks
    .map((c) => (c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1) : c))
    .join('');
  return { value, quoted };
}