/**
 * SDK Signature Verify — types (Stage 121).
 *
 * Cosign / sigstore-style detached signature verification for SDK artifacts.
 */

export interface SignatureKeyPair {
  /** Public key (PEM/base64). */
  publicKey: string;
  /** Private key (PEM/base64) — only present for testing. */
  privateKey?: string;
  /** Key id. */
  id: string;
}

export interface SignatureBlob {
  /** Base64 signature. */
  signature: string;
  /** Algorithm used. */
  algorithm: 'ed25519' | 'rsa-sha256' | 'ecdsa-p256';
  /** Key id this signature was produced with. */
  keyId: string;
}

export interface SignedArtifact {
  artifactPath: string;
  /** SHA-256 digest of the payload (hex). */
  digest: string;
  signature: SignatureBlob;
  /** Optional ISO timestamp. */
  signedAt?: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: 'missing_key' | 'invalid_signature' | 'algorithm_mismatch' | 'malformed_signature';
}

export interface BundleEntry {
  /** Path or id. */
  key: string;
  digest: string;
}

export interface VerificationBundle {
  entries: readonly BundleEntry[];
  /** Map key → signature. */
  signatures: Readonly<Record<string, SignatureBlob>>;
}

export interface BundleVerifyResult {
  ok: boolean;
  failed: string[];
}

export const SIG_ALGORITHMS = ['ed25519', 'rsa-sha256', 'ecdsa-p256'] as const;