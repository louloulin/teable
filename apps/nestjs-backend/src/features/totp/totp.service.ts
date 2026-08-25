/**
 * TOTP 2FA — Stage 22.
 *
 * Pure helpers used by the controller / service. No Prisma access
 * here so the helpers stay trivially testable.
 *
 * The implementation follows RFC 6238 (TOTP) on top of RFC 4226 (HOTP):
 *
 *   T = floor((now - T0) / X)   where X is the period (default 30s)
 *   code = HOTP(K, T) mod 10^digits
 *
 * We accept a small verification window (±1 step) so clock skew
 * between the server and the user's phone doesn't reject legit codes.
 */

import { createHmac, randomBytes, createHash } from 'crypto';

import type { ITotpFactorRow, TotpAlgorithm } from './totp.types';

/** Default step period (RFC 6238 §4.1). */
export const DEFAULT_PERIOD = 30;
/** Default digit count (RFC 6238 §4.1). */
export const DEFAULT_DIGITS = 6;
/** Default hash (RFC 6238 §4.1 — SHA-1 retained for compatibility). */
export const DEFAULT_ALGORITHM: TotpAlgorithm = 'SHA1';
/** Number of periods either side of the current step we accept. */
const VERIFICATION_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Generate a fresh base32-encoded shared secret, 160 bits by default. */
export function generateSecret(bytes = 20): string {
  // randomBytes is already uniform; we just need to encode it.
  const buf = randomBytes(bytes);
  return base32Encode(buf);
}

/** Encode a Buffer as base32 (RFC 4648 §6 — no padding required for TOTP). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/** Decode a base32 string back to a Buffer; rejects invalid chars. */
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Compute the current TOTP counter for `now`. */
export function currentCounter(now: number, period: number): bigint {
  return BigInt(Math.floor(now / 1000 / period));
}

/** HOTP value at counter `counter`, truncated to `digits`. */
export function hotp(
  secret: Buffer,
  counter: bigint,
  digits: number,
  algorithm: TotpAlgorithm
): string {
  const buf = Buffer.alloc(8);
  // HOTP counter is 8-byte big-endian. BigInt writes it portably.
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const algo = algorithm.toLowerCase();
  const hmac = createHmac(algo, secret).update(buf).digest();
  // Dynamic truncation (RFC 4226 §5.3).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return (binCode % mod).toString().padStart(digits, '0');
}

/** TOTP code at a given wall-clock `nowMs`. */
export function totp(
  factor: Pick<ITotpFactorRow, 'secret' | 'digits' | 'period' | 'algorithm'>,
  nowMs: number
): string {
  const secretBuf = base32Decode(factor.secret);
  const counter = currentCounter(nowMs, factor.period);
  return hotp(secretBuf, counter, factor.digits, factor.algorithm);
}

/**
 * Verify a candidate code against a factor. Returns the counter
 * that matched, or null. Callers should reject any counter ≤
 * `factor.lastCounter` to prevent replay within the window.
 */
export function verifyCode(
  factor: Pick<ITotpFactorRow, 'secret' | 'digits' | 'period' | 'algorithm' | 'lastCounter'>,
  code: string,
  nowMs: number
): bigint | null {
  if (!/^\d{6,8}$/.test(code)) return null;
  const secretBuf = base32Decode(factor.secret);
  const counter = currentCounter(nowMs, factor.period);
  for (let delta = -VERIFICATION_WINDOW; delta <= VERIFICATION_WINDOW; delta++) {
    const candidate = counter + BigInt(delta);
    const expected = hotp(secretBuf, candidate, factor.digits, factor.algorithm);
    if (constantTimeEqual(expected, code) && candidate > factor.lastCounter) {
      return candidate;
    }
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Build the otpauth:// URI rendered as a QR by the frontend. */
export function buildOtpauthUri(input: {
  secret: string;
  label: string;
  issuer: string;
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
}): string {
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: input.algorithm ?? DEFAULT_ALGORITHM,
    digits: String(input.digits ?? DEFAULT_DIGITS),
    period: String(input.period ?? DEFAULT_PERIOD),
  });
  // label format: "Issuer:account@example.com" per the spec
  const label = input.label.includes(':') ? input.label : `${input.issuer}:${input.label}`;
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/** Generate N single-use backup codes (8-char alphanumeric). */
export function generateBackupCodes(count = 10, bytesPerCode = 5): string[] {
  const out: string[] = [];
  while (out.length < count) {
    const code = base32Encode(randomBytes(bytesPerCode))
      .toLowerCase()
      .replace(/=+$/g, '')
      .slice(0, 8);
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Hash a backup code for at-rest comparison. */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

/** Returns the next moment at which a new code window opens. */
export function nextWindowAt(period: number, nowMs: number): number {
  const secs = Math.floor(nowMs / 1000);
  return (Math.floor(secs / period) + 1) * period * 1000;
}
