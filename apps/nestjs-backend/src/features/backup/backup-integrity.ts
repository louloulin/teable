/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Backup integrity layer (R55).
 *
 * Adds checksum + encryption at rest to backup snapshots. The on-disk
 * store writes a self-describing envelope that bundles:
 *
 *   {
 *     "v": 1,
 *     "alg": "AES-256-GCM",
 *     "iv": "<base64>",
 *     "authTag": "<base64>",
 *     "checksum": "sha256:<hex>",      // SHA-256 of the encrypted payload
 *     "manifest": { ... },              // plain (or also encrypted) IBackupManifest
 *     "ciphertext": "<base64>"          // encrypted gzipped JSON payload
 *   }
 *
 * Workflow:
 *   wrapForArchive({ manifest, payload }, key)  -> envelope JSON
 *   unwrapFromArchive(envelope, key)           -> { manifest, payload }
 *     - throws on checksum mismatch (corruption)
 *     - throws on auth tag mismatch (tampering / wrong key)
 *
 * Pure helpers; depends only on Node `crypto`. No Nest, no Prisma, no FS.
 *
 * License: AGPL-3.0
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const BACKUP_ENVELOPE_VERSION = 1;
export const BACKUP_ENVELOPE_ALG = 'AES-256-GCM';
export const BACKUP_CHECKSUM_ALG = 'sha256';

/** A 32-byte (256-bit) symmetric key. */
export type BackupKey = Buffer;

export interface IBackupEnvelope {
  v: number;
  alg: typeof BACKUP_ENVELOPE_ALG;
  /** base64 IV (12 bytes for GCM). */
  iv: string;
  /** base64 auth tag (16 bytes for GCM). */
  authTag: string;
  /** "sha256:<hex>" of the ciphertext bytes. */
  checksum: string;
  /** Plain manifest (tables / recordCount / totalRecords / payloadBytes). */
  manifest: unknown;
  /** base64 of the encrypted gzipped-JSON payload. */
  ciphertext: string;
  /** ISO timestamp when the envelope was produced. */
  producedAt: string;
}

export interface IBackupWrapInput {
  manifest: unknown;
  /** Raw bytes to encrypt (typically `gzipSync(JSON.stringify(records))`). */
  payload: Uint8Array;
}

export interface IBackupUnwrapResult {
  manifest: unknown;
  payload: Uint8Array;
}

/**
 * Derive a 32-byte key from arbitrary input. Production should pass a
 * real KMS-derived key; tests can pass any stable string.
 */
export function deriveBackupKey(input: string | Buffer): BackupKey {
  return createHash('sha256').update(input).digest();
}

/** SHA-256 of a byte buffer, returned as `sha256:<hex>`. */
export function sha256Checksum(bytes: Uint8Array): string {
  return `${BACKUP_CHECKSUM_ALG}:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Verify a checksum; throws on mismatch with a stable error code. */
export function verifyChecksum(expected: string, bytes: Uint8Array): void {
  const actual = sha256Checksum(bytes);
  if (actual !== expected) {
    const err = new Error(
      `backup checksum mismatch: expected=${expected} actual=${actual}`
    );
    (err as Error & { code: string }).code = 'BACKUP_CHECKSUM_MISMATCH';
    throw err;
  }
}

/**
 * Encrypt `payload` with AES-256-GCM using `key`. Returns base64 IV,
 * base64 authTag, and base64 ciphertext.
 */
export function encryptPayload(
  payload: Uint8Array,
  key: BackupKey
): { iv: string; authTag: string; ciphertext: string } {
  if (key.length !== 32) {
    const err = new Error(`backup key must be 32 bytes, got ${key.length}`);
    (err as Error & { code: string }).code = 'BACKUP_KEY_LENGTH';
    throw err;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ct.toString('base64'),
  };
}

/** Decrypt with AES-256-GCM; throws on auth tag mismatch (tampering / wrong key). */
export function decryptPayload(
  ciphertext: string,
  iv: string,
  authTag: string,
  key: BackupKey
): Uint8Array {
  if (key.length !== 32) {
    const err = new Error(`backup key must be 32 bytes, got ${key.length}`);
    (err as Error & { code: string }).code = 'BACKUP_KEY_LENGTH';
    throw err;
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]);
    return new Uint8Array(pt);
  } catch (e) {
    const err = new Error(
      `backup decryption failed: ${(e as Error).message ?? e}`
    );
    (err as Error & { code: string }).code = 'BACKUP_AUTH_TAG_MISMATCH';
    throw err;
  }
}

/**
 * Build a self-describing backup envelope. The envelope can be JSON-stringified
 * and written to any IBackupStore; `unwrapFromArchive` reverses the process.
 */
export function wrapForArchive(input: IBackupWrapInput, key: BackupKey): IBackupEnvelope {
  const { iv, authTag, ciphertext } = encryptPayload(input.payload, key);
  const ctBytes = Buffer.from(ciphertext, 'base64');
  return {
    v: BACKUP_ENVELOPE_VERSION,
    alg: BACKUP_ENVELOPE_ALG,
    iv,
    authTag,
    checksum: sha256Checksum(ctBytes),
    manifest: input.manifest,
    ciphertext,
    producedAt: new Date().toISOString(),
  };
}

/**
 * Reverse `wrapForArchive`. Throws on:
 *   - version mismatch (BACKUP_VERSION_UNSUPPORTED)
 *   - algorithm mismatch (BACKUP_ALG_UNSUPPORTED)
 *   - checksum mismatch (BACKUP_CHECKSUM_MISMATCH)
 *   - auth tag mismatch (BACKUP_AUTH_TAG_MISMATCH)
 *
 * All errors carry a stable `code` property for caller-side branching.
 */
export function unwrapFromArchive(envelope: IBackupEnvelope, key: BackupKey): IBackupUnwrapResult {
  if (envelope.v !== BACKUP_ENVELOPE_VERSION) {
    const err = new Error(`backup envelope version ${envelope.v} not supported`);
    (err as Error & { code: string }).code = 'BACKUP_VERSION_UNSUPPORTED';
    throw err;
  }
  if (envelope.alg !== BACKUP_ENVELOPE_ALG) {
    const err = new Error(`backup envelope algorithm ${envelope.alg} not supported`);
    (err as Error & { code: string }).code = 'BACKUP_ALG_UNSUPPORTED';
    throw err;
  }
  const ctBytes = Buffer.from(envelope.ciphertext, 'base64');
  verifyChecksum(envelope.checksum, ctBytes);
  const payload = decryptPayload(envelope.ciphertext, envelope.iv, envelope.authTag, key);
  return { manifest: envelope.manifest, payload };
}

/**
 * Cross-tenant guard: a snapshot can only be restored into a target base
 * that matches the snapshot's original baseId. Returns the resolved target
 * baseId when allowed, throws otherwise. Pass `allowCrossTenant=true` to
 * explicitly permit (e.g. clone-into-new-base workflow).
 */
export function assertRestoreTargetAllowed(input: {
  snapshotBaseId: string;
  targetBaseId: string;
  allowCrossTenant?: boolean;
}): { targetBaseId: string } {
  if (input.snapshotBaseId === input.targetBaseId) {
    return { targetBaseId: input.targetBaseId };
  }
  if (input.allowCrossTenant) {
    return { targetBaseId: input.targetBaseId };
  }
  const err = new Error(
    `backup cross-tenant restore blocked: snapshot.baseId=${input.snapshotBaseId} target.baseId=${input.targetBaseId}`
  );
  (err as Error & { code: string }).code = 'BACKUP_CROSS_TENANT_BLOCKED';
  throw err;
}
