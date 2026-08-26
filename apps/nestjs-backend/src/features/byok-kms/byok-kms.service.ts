/**
 * BYOK KMS — Stage 35.
 *
 * Pure crypto helpers: DEK generation, envelope encryption,
 * rotation policy evaluation, audit hash computation.
 *
 * The actual master-key wrappers are pluggable via the
 * KmsProvider interface in `byok-kms.auth.service`.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type {
  ICustomerKmsKey,
  IEnvelopeEncrypted,
  IRegisterKeyInput,
  IRotationPolicy,
  IUnwrappedDataKey,
} from './byok-kms.types';

export const ALGORITHM = 'AES-256-GCM';
export const DEK_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

export function generateAlias(seed: string): string {
  const slug = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const tail = randomBytes(4).toString('hex');
  return `${slug.slice(0, 40) || 'key'}-${tail}`;
}

export function isValidAlias(alias: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(alias);
}

/** Generate a per-record data-encryption key (DEK). */
export function generateDek(): Buffer {
  return randomBytes(DEK_BYTES);
}

/** AES-256-GCM encrypt arbitrary plaintext with a DEK. */
export function encryptWithDek(input: { dek: Buffer; plaintext: Buffer }): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, input.dek, iv);
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  const tag = (cipher as unknown as { getAuthTag: () => Buffer }).getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptWithDek(input: { dek: Buffer; blob: Buffer }): Buffer {
  if (input.blob.length < IV_BYTES + TAG_BYTES) throw new Error('ciphertext too short');
  const iv = input.blob.subarray(0, IV_BYTES);
  const tag = input.blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = input.blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, input.dek, iv);
  (decipher as unknown as { setAuthTag: (tag: Buffer) => void }).setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Envelope-encrypt a freshly generated DEK under a master key (raw bytes). */
export function wrapDek(input: {
  dek: Buffer;
  masterKey: Buffer;
  keyId: string;
  keyVersion?: string | null;
}): IEnvelopeEncrypted {
  if (input.masterKey.length !== DEK_BYTES) throw new Error('masterKey must be 32 bytes');
  const wrapped = encryptWithDek({ dek: input.masterKey, plaintext: input.dek });
  return {
    keyId: input.keyId,
    wrappedDek: wrapped.toString('base64'),
    algorithm: ALGORITHM,
    keyVersion: input.keyVersion ?? null,
  };
}

export function unwrapDek(input: {
  envelope: IEnvelopeEncrypted;
  masterKey: Buffer;
}): IUnwrappedDataKey {
  if (input.masterKey.length !== DEK_BYTES) throw new Error('masterKey must be 32 bytes');
  if (input.envelope.algorithm !== ALGORITHM)
    throw new Error(`unsupported algorithm: ${input.envelope.algorithm}`);
  const blob = Buffer.from(input.envelope.wrappedDek, 'base64');
  const dek = decryptWithDek({ dek: input.masterKey, blob });
  return { raw: dek, keyId: input.envelope.keyId, keyVersion: input.envelope.keyVersion };
}

/** SHA-256 of the wrapped DEK — useful for audit deduplication. */
export function envelopeHash(envelope: IEnvelopeEncrypted): string {
  return createHash('sha256').update(envelope.wrappedDek).digest('hex');
}

/** Decide whether a key is due for rotation given its policy. */
export function isRotationDue(input: { key: ICustomerKmsKey; now?: Date }): boolean {
  if (!input.key.rotationPolicy) return false;
  if (input.key.rotationPolicy.rotateAfterDays <= 0) return false;
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.key.createdTime.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays >= input.key.rotationPolicy.rotateAfterDays;
}

export function daysUntilRotation(input: { key: ICustomerKmsKey; now?: Date }): number | null {
  if (!input.key.rotationPolicy) return null;
  if (input.key.rotationPolicy.rotateAfterDays <= 0) return null;
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.key.createdTime.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const remaining = input.key.rotationPolicy.rotateAfterDays - ageDays;
  return Math.ceil(remaining);
}

export function parseRotationPolicy(json: string | null): IRotationPolicy | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof parsed.rotateAfterDays === 'number'
    ) {
      const result: IRotationPolicy = { rotateAfterDays: parsed.rotateAfterDays };
      if (typeof parsed.notifyBeforeDays === 'number')
        result.notifyBeforeDays = parsed.notifyBeforeDays;
      return result;
    }
  } catch {
    // fallthrough
  }
  return null;
}

export function stringifyRotationPolicy(policy: IRotationPolicy | null | undefined): string | null {
  if (!policy) return null;
  return JSON.stringify(policy);
}

export function buildKeyRow(
  input: IRegisterKeyInput & { id: string; now?: Date }
): ICustomerKmsKey {
  return {
    id: input.id,
    organizationId: input.organizationId,
    alias: input.alias,
    provider: input.provider,
    keyId: input.keyId,
    keyVersion: input.keyVersion ?? null,
    status: 'enabled',
    rotationPolicy: input.rotationPolicy ?? null,
    createdBy: input.createdBy,
    createdTime: input.now ?? new Date(),
    updatedTime: input.now ?? new Date(),
    lastUsedAt: null,
  };
}

/** Pad / strip a base64-encoded master key string to 32 raw bytes. */
export function normalizeMasterKey(input: {
  keyMaterial: string;
  fallback?: Buffer | null;
}): Buffer {
  try {
    const buf = Buffer.from(input.keyMaterial, 'base64');
    if (buf.length === DEK_BYTES) return buf;
  } catch {
    // fallthrough
  }
  // Treat as utf-8 string and derive 32 bytes via SHA-256
  return createHash('sha256').update(input.keyMaterial).digest();
}
