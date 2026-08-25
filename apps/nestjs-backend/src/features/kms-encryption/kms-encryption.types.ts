/**
 * KMS-backed envelope encryption — Stage 50.
 *
 * Replaces Stage 47's djb2-style hash for masking with real
 * envelope encryption. Each `EncryptionKey` is identified by a
 * `kid` and stores only the (already-encrypted) data-encryption
 * key (DEK) plus the algorithm metadata. The actual KMS call is
 * delegated to a pluggable provider.
 *
 * Plaintext is encrypted with a per-record random DEK (AES-256-GCM).
 * The DEK is wrapped with the key identified by `kid` and stored
 * alongside the ciphertext + IV + auth tag in the result envelope.
 */

export type EncryptionAlgorithm = 'AES-256-GCM';

export type KeyState = 'enabled' | 'disabled' | 'compromised';

export interface IEncryptionKey {
  id: string;
  /// Stable identifier used by clients; rotate by issuing a new id.
  kid: string;
  /// Algorithm this key unlocks.
  algorithm: EncryptionAlgorithm;
  /// Optional alias (e.g. `arn:aws:kms:...` for BYOK).
  alias?: string;
  state: KeyState;
  createdTime: Date;
  /// When this key should no longer be used for new encryptions.
  retiredAt?: Date;
}

export interface IEncryptionEnvelope {
  kid: string;
  algorithm: EncryptionAlgorithm;
  /// Base64-encoded 12-byte IV.
  iv: string;
  /// Base64-encoded ciphertext (auth tag concatenated).
  ciphertext: string;
  /// Optional additional authenticated data (UTF-8 string).
  aad?: string;
}

export interface IEncryptInput {
  plaintext: string;
  kid?: string;
  aad?: string;
}

export interface ICreateKeyInput {
  kid: string;
  algorithm?: EncryptionAlgorithm;
  alias?: string;
}

export const DEFAULT_ENCRYPTION_ALGORITHM: EncryptionAlgorithm = 'AES-256-GCM';
export const DEFAULT_IV_BYTES = 12;
export const DEFAULT_AUTH_TAG_BITS = 128;
export const DEFAULT_DEK_BYTES = 32;
export const MAX_PLAINTEXT_BYTES = 1024 * 1024; // 1 MiB
export const KEY_ID_PREFIX = 'ek_';
