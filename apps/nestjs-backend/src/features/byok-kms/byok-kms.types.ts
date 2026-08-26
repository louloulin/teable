/**
 * BYOK KMS — Stage 35 types.
 *
 * Customer-managed encryption keys with envelope encryption.
 * A CustomerKmsKey references a master key in a provider (aws,
 * gcp, vault, local) and is used to wrap per-record data keys
 * (envelope encryption). The data-key ciphertext is what we
 * persist; the plaintext key lives only in memory.
 */

export type KmsProvider = 'aws' | 'gcp' | 'azure' | 'vault' | 'local';

export type KmsKeyStatus = 'enabled' | 'disabled' | 'pending-deletion';

export type KmsOperation = 'wrap' | 'unwrap' | 'rotate' | 'disable';

export type KmsCallerType = 'service' | 'user' | 'system';

export interface IRotationPolicy {
  /** Rotate every N days; 0 means disabled. */
  rotateAfterDays: number;
  /** Notify N days before rotation. */
  notifyBeforeDays?: number;
}

export interface ICustomerKmsKey {
  id: string;
  organizationId: string;
  alias: string;
  provider: KmsProvider;
  keyId: string;
  keyVersion: string | null;
  status: KmsKeyStatus;
  rotationPolicy: IRotationPolicy | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
  lastUsedAt: Date | null;
}

export interface IKmsAuditEntry {
  id: string;
  organizationId: string;
  keyId: string;
  operation: KmsOperation;
  callerType: KmsCallerType;
  callerId: string | null;
  payloadHash: string | null;
  atTime: Date;
}

export interface IRegisterKeyInput {
  organizationId: string;
  alias: string;
  provider: KmsProvider;
  keyId: string;
  keyVersion?: string | null;
  rotationPolicy?: IRotationPolicy | null;
  createdBy: string;
}

export interface IEnvelopeEncrypted {
  /** Provider key id (master). */
  keyId: string;
  /** The wrapped DEK (base64). */
  wrappedDek: string;
  /** Algorithm used to wrap (e.g. 'AES-256-GCM'). */
  algorithm: string;
  /** Version of the master key used (for rotation handling). */
  keyVersion: string | null;
}

export interface IUnwrappedDataKey {
  /** Raw DEK bytes (32 bytes for AES-256). */
  raw: Buffer;
  /** Same keyId/version that wrapped it, for reference. */
  keyId: string;
  keyVersion: string | null;
}
