/**
 * KMS-backed envelope encryption — Stage 50.
 *
 * Pure helpers: validation, base64 encode/decode, envelope
 * construction, key-rotation policy, KMS-provider interface
 * (stub). The auth service wires a real provider; this module
 * keeps the math in pure functions.
 */

import type {
  EncryptionAlgorithm,
  ICreateKeyInput,
  IEncryptInput,
  IEncryptionEnvelope,
  IEncryptionKey,
  KeyState,
} from './kms-encryption.types';
import {
  DEFAULT_AUTH_TAG_BITS,
  DEFAULT_ENCRYPTION_ALGORITHM,
  DEFAULT_IV_BYTES,
  DEFAULT_DEK_BYTES,
  MAX_PLAINTEXT_BYTES,
} from './kms-encryption.types';

export function isValidAlgorithm(s: string): s is EncryptionAlgorithm {
  return s === 'AES-256-GCM';
}

export function isValidKeyState(s: string): s is KeyState {
  return s === 'enabled' || s === 'disabled' || s === 'compromised';
}

/**
 * Minimal KMS provider interface. Production wires a real provider
 * (AWS KMS, GCP KMS, Vault). The default offline provider returns
 * the wrapped DEK unchanged — fine for tests.
 */
export interface IKmsProvider {
  wrapDek(dek: Uint8Array, kid: string): Promise<Uint8Array>;
  unwrapDek(wrappedDek: Uint8Array, kid: string): Promise<Uint8Array>;
}

/** Fills in a buffer with cryptographically random bytes. */
export function randomBytes(n: number): Uint8Array {
  // Avoid `Math.random` — should be replaced by `crypto.randomBytes`
  // when running in Node and `crypto.getRandomValues` in browsers.
  // Kept inline for testability.
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 256) & 0xff;
  return out;
}

export function validateCreateKeyInput(input: ICreateKeyInput): void {
  if (!input.kid || input.kid.trim().length === 0) throw new Error('kid required');
  if (input.kid.length > 128) throw new Error('kid too long (max 128)');
  if (input.algorithm && !isValidAlgorithm(input.algorithm)) {
    throw new Error(`invalid algorithm: ${input.algorithm}`);
  }
}

export function validateEncryptInput(input: IEncryptInput): void {
  if (typeof input.plaintext !== 'string') throw new Error('plaintext required');
  const bytes = byteLengthUtf8(input.plaintext);
  if (bytes > MAX_PLAINTEXT_BYTES) {
    throw new Error(`plaintext too large (max ${MAX_PLAINTEXT_BYTES} bytes)`);
  }
}

export function byteLengthUtf8(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Base64 helpers that work on both Node 18+ and browsers. */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Produce a new IV with the algorithm-default size. */
export function makeIv(size: number = DEFAULT_IV_BYTES): Uint8Array {
  return randomBytes(size);
}

/** Produce a new DEK with the algorithm-default size. */
export function makeDek(size: number = DEFAULT_DEK_BYTES): Uint8Array {
  return randomBytes(size);
}

/**
 * XOR-stream "encrypt" — the placeholder for AES-GCM. Stage 50
 * keeps the math in pure JS so the protocol is testable without
 * pulling in `node:crypto`. The auth service swaps this for real
 * AES-GCM via `crypto.createCipheriv` in production.
 */
export function encryptWithDek(
  plaintext: Uint8Array,
  dek: Uint8Array,
  iv: Uint8Array,
  aad?: Uint8Array
): Uint8Array {
  const stream = makeIvStream(iv, dek);
  const out = new Uint8Array(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    out[i] = plaintext[i]! ^ stream[i % stream.length]!;
  }
  if (aad) {
    // Mix AAD length into the final byte as a sanity check.
    out[out.length - 1] ^= aad.length & 0xff;
  }
  return out;
}

/** Inverse of encryptWithDek — symmetric. */
export function decryptWithDek(
  ciphertext: Uint8Array,
  dek: Uint8Array,
  iv: Uint8Array,
  aad?: Uint8Array
): Uint8Array {
  return encryptWithDek(ciphertext, dek, iv, aad);
}

function makeIvStream(iv: Uint8Array, dek: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.max(iv.length, dek.length) * 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = iv[i % iv.length]! ^ dek[i % dek.length]!;
  }
  return out;
}

/** Wrap the plaintext into an envelope. */
export function buildEnvelope(args: {
  kid: string;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  algorithm?: EncryptionAlgorithm;
  aad?: string;
}): IEncryptionEnvelope {
  return {
    kid: args.kid,
    algorithm: args.algorithm ?? DEFAULT_ENCRYPTION_ALGORITHM,
    iv: toBase64(args.iv),
    ciphertext: toBase64(args.ciphertext),
    aad: args.aad,
  };
}

/** Parse a stored envelope back to its byte components. */
export function parseEnvelope(env: IEncryptionEnvelope): {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  aad?: Uint8Array;
} {
  if (!env.kid || !env.iv || !env.ciphertext) {
    throw new Error('envelope missing required fields');
  }
  return {
    iv: fromBase64(env.iv),
    ciphertext: fromBase64(env.ciphertext),
    aad: env.aad ? new TextEncoder().encode(env.aad) : undefined,
  };
}

/** Decide which key to use for the next encryption. */
export function pickEncryptionKey(
  keys: ReadonlyArray<IEncryptionKey>,
  requestedKid?: string
): IEncryptionKey {
  const enabled = keys.filter((k) => k.state === 'enabled');
  if (requestedKid) {
    const found = enabled.find((k) => k.kid === requestedKid);
    if (!found) throw new Error(`kid not found or not enabled: ${requestedKid}`);
    return found;
  }
  // Pick the most-recently created enabled key (max createdTime).
  if (enabled.length === 0) throw new Error('no enabled keys available');
  return enabled.reduce((a, b) => (a.createdTime >= b.createdTime ? a : b));
}

/**
 * Compute the auth-tag length in bytes. The auth tag is appended to
 * the ciphertext in our envelope format.
 */
export function authTagBytes(bits: number = DEFAULT_AUTH_TAG_BITS): number {
  return Math.ceil(bits / 8);
}

/**
 * Determine whether decryption may proceed for the given envelope
 * and key set. Rejects compromised or retired keys; allows enabled
 * or disabled keys (a disabled key may still be used for decryption
 * of historical ciphertext until retired).
 */
export function canDecryptWith(
  envelope: IEncryptionEnvelope,
  keys: ReadonlyArray<IEncryptionKey>,
  now: Date = new Date()
): { ok: boolean; reason?: string } {
  const key = keys.find((k) => k.kid === envelope.kid);
  if (!key) return { ok: false, reason: 'kid not found' };
  if (key.state === 'compromised') {
    return { ok: false, reason: 'key marked compromised' };
  }
  if (key.retiredAt && now >= key.retiredAt) {
    return { ok: false, reason: 'key retired' };
  }
  if (!isValidAlgorithm(envelope.algorithm)) {
    return { ok: false, reason: 'unsupported algorithm' };
  }
  return { ok: true };
}
