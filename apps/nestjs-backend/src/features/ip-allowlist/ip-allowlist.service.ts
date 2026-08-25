/**
 * IP allowlist — Stage 25.
 *
 * Pure CIDR matching helpers used by the controller + middleware.
 * Supports IPv4 + IPv6 with prefix-length based masks.
 *
 * References:
 *   - RFC 4632 (Classless Inter-Domain Routing)
 *   - RFC 4291 (IPv6 addressing)
 */

import type {
  IIpAllowlistDecision,
  IIpAllowlistEntry,
  IpAllowlistMode,
} from './ip-allowlist.types';

/** Validate a CIDR string. Throws on malformed input. */
export function parseCidr(cidr: string): { family: 4 | 6; base: bigint; prefix: number } {
  const idx = cidr.indexOf('/');
  if (idx < 0) throw new Error('CIDR missing prefix length');
  const ip = cidr.slice(0, idx).trim();
  const prefixStr = cidr.slice(idx + 1).trim();
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0) throw new Error('invalid prefix length');
  const bytes = parseIp(ip);
  if (!bytes) throw new Error('invalid IP address');
  if (bytes.length === 4 && prefix > 32) throw new Error('IPv4 prefix > 32');
  if (bytes.length === 16 && prefix > 128) throw new Error('IPv6 prefix > 128');
  const mask = prefixMask(bytes.length * 8, prefix);
  const base = bytesToBigInt(bytes) & mask;
  return { family: bytes.length === 4 ? 4 : 6, base, prefix };
}

/**
 * Parse an IPv4 or IPv6 string into bytes (4 or 16 length).
 * Returns null on failure.
 *
 * IPv6 parsing strategy: count the `::` zero-run, place leading and
 * trailing hextets, fill the middle with zeros. We accept the
 * `::ffff:a.b.c.d` (IPv4-mapped) form by parsing the dotted tail and
 * dropping it into the last 4 bytes.
 */
export function parseIp(ip: string): Uint8Array | null {
  if (ip.includes(':')) return parseIpv6(ip);
  return parseIpv4(ip);
}

function parseIpv4(ip: string): Uint8Array | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out[i] = n;
  }
  return out;
}

function parseIpv6(ip: string): Uint8Array | null {
  // Split off a trailing IPv4 dotted-quad (e.g. ::ffff:10.0.0.1).
  const v4Match = /^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  let v4: Uint8Array | null = null;
  let head = ip;
  if (v4Match) {
    v4 = parseIpv4(v4Match[2]!);
    if (!v4) return null;
    head = v4Match[1]!;
  }
  // Detect zero-run.
  const zeroRunCount = (head.match(/::/g) ?? []).length;
  if (zeroRunCount > 1) return null;
  const parts = head.split('::');
  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts[1] !== undefined && parts[1] !== '' ? parts[1].split(':') : [];
  // When the address starts with `::`, parts[0] is ''; when it ends with `::`, parts[1] is ''.
  if (parts.length === 1 && !head.includes('::')) {
    // No zero-run; must be exactly 8 hextets (or 6 + v4 = 8 bytes).
    const all = head.split(':');
    if (v4) {
      if (all.length !== 6) return null;
    } else if (all.length !== 8) return null;
    left = all;
    right = [];
  }
  const used = left.length + right.length + (v4 ? 2 : 0);
  const total = 8;
  const pad = total - used;
  if (pad < 0) return null;
  const out = new Uint8Array(16);
  let p = 0;
  for (const g of left) {
    const v = Number.parseInt(g, 16);
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) return null;
    out[p++] = (v >> 8) & 0xff;
    out[p++] = v & 0xff;
  }
  for (let i = 0; i < pad; i++) {
    out[p++] = 0;
    out[p++] = 0;
  }
  for (const g of right) {
    const v = Number.parseInt(g, 16);
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) return null;
    out[p++] = (v >> 8) & 0xff;
    out[p++] = v & 0xff;
  }
  if (v4) {
    out[12] = v4[0]!;
    out[13] = v4[1]!;
    out[14] = v4[2]!;
    out[15] = v4[3]!;
  }
  return out;
}

function prefixMask(totalBits: number, prefix: number): bigint {
  if (prefix === 0) return 0n;
  let mask = 0n;
  for (let i = totalBits - prefix; i < totalBits; i++) {
    mask |= 1n << BigInt(i);
  }
  return mask;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (const b of bytes) {
    out = (out << 8n) | BigInt(b);
  }
  return out;
}

/** True when `ip` falls within the CIDR block. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const bytes = parseIp(ip);
  if (!bytes) return false;
  const block = parseCidr(cidr);
  const bits = bytes.length * 8;
  if ((bytes.length === 4 ? 4 : 6) !== block.family) {
    // Treat IPv4-mapped IPv6 (::ffff:a.b.c.d) as IPv4 for matching.
    if (bytes.length === 16 && block.family === 4) {
      const tail = new Uint8Array([bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!]);
      const v = bytesToBigInt(tail);
      const mask = prefixMask(32, block.prefix);
      return (v & mask) === block.base;
    }
    return false;
  }
  const v = bytesToBigInt(bytes);
  const mask = prefixMask(bits, block.prefix);
  return (v & mask) === block.base;
}

/**
 * Decide whether a request should be allowed given a set of entries.
 * When the entry list is empty, no enforcement happens (allowed = true,
 * blocked = false, audited = false).
 */
export function decide(input: { ip: string; entries: IIpAllowlistEntry[] }): IIpAllowlistDecision {
  if (input.entries.length === 0) {
    return { allowed: true, blocked: false, audited: false, matchedEntryId: null };
  }
  let audited = false;
  let blocked = false;
  let matchedEntryId: string | null = null;
  for (const entry of input.entries) {
    if (!ipInCidr(input.ip, entry.cidr)) continue;
    matchedEntryId = entry.id;
    if (entry.mode === 'block') {
      blocked = true;
      break;
    }
    if (entry.mode === 'audit') {
      audited = true;
    }
  }
  return {
    allowed: !blocked,
    blocked,
    audited,
    matchedEntryId,
  };
}

/** Extract the first IP from an `X-Forwarded-For`-style header. Falls back to null. */
export function extractClientIp(headers: {
  'x-forwarded-for'?: string;
  'x-real-ip'?: string;
}): string | null {
  const xff = headers['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = headers['x-real-ip'];
  if (xri) return xri.trim();
  return null;
}

/** Map a string to a known IpAllowlistMode, defaulting to 'block'. */
export function coerceMode(input: string | null | undefined): IpAllowlistMode {
  return input === 'audit' ? 'audit' : 'block';
}
