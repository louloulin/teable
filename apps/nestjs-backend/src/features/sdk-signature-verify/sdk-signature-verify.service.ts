/**
 * SDK Signature Verify — pure helpers (Stage 121).
 */

import {
  BundleEntry,
  BundleVerifyResult,
  SignatureBlob,
  SignatureKeyPair,
  SignedArtifact,
  SIG_ALGORITHMS,
  VerifyResult,
} from './sdk-signature-verify.types';
import { createHash, createHmac } from 'node:crypto';

/** SHA-256 hex digest of a payload. */
export function digest(payload: string | Uint8Array): string {
  return createHash('sha256').update(payload).digest('hex');
}

/** Produce a deterministic test signature (HMAC-SHA256 keyed by privateKey) for the given digest. */
export function sign(keyPair: SignatureKeyPair, digestHex: string, algorithm: SignatureBlob['algorithm']): SignatureBlob {
  if (!keyPair.privateKey) throw new Error('missing private key');
  const sig = createHmac('sha256', keyPair.privateKey).update(digestHex).digest('base64');
  return { signature: sig, algorithm, keyId: keyPair.id };
}

/** Verify a signature. The verification is HMAC-SHA256-equivalent (deterministic test implementation). */
export function verify(keyPair: SignatureKeyPair | undefined, signed: SignedArtifact): VerifyResult {
  if (!keyPair) return { ok: false, reason: 'missing_key' };
  if (!SIG_ALGORITHMS.includes(signed.signature.algorithm)) return { ok: false, reason: 'algorithm_mismatch' };
  if (!signed.signature.signature) return { ok: false, reason: 'malformed_signature' };
  // Recompute expected HMAC from the provided digest.
  const expected = createHmac('sha256', keyPair.privateKey ?? keyPair.publicKey).update(signed.digest).digest('base64');
  if (expected !== signed.signature.signature) return { ok: false, reason: 'invalid_signature' };
  return { ok: true };
}

/** Build a SignedArtifact from a payload + keyPair. */
export function signArtifact(keyPair: SignatureKeyPair, artifactPath: string, payload: string | Uint8Array, algorithm: SignatureBlob['algorithm']): SignedArtifact {
  const d = digest(payload);
  return { artifactPath, digest: d, signature: sign(keyPair, d, algorithm), signedAt: new Date().toISOString() };
}

/** Verify a SignedArtifact against a key store. */
export function verifyArtifact(keyStore: ReadonlyMap<string, SignatureKeyPair>, signed: SignedArtifact): VerifyResult {
  const key = keyStore.get(signed.signature.keyId);
  return verify(key, signed);
}

/** Build a verification bundle from artifacts + signatures. */
export function buildBundle(artifacts: readonly SignedArtifact[]): { entries: BundleEntry[]; signatures: Record<string, SignatureBlob> } {
  const entries: BundleEntry[] = artifacts.map((a) => ({ key: a.artifactPath, digest: a.digest }));
  const signatures: Record<string, SignatureBlob> = {};
  for (const a of artifacts) signatures[a.artifactPath] = a.signature;
  return { entries, signatures };
}

/** Verify a whole bundle against a key store. */
export function verifyBundle(keyStore: ReadonlyMap<string, SignatureKeyPair>, bundle: { entries: readonly BundleEntry[]; signatures: Readonly<Record<string, SignatureBlob>> }): BundleVerifyResult {
  const failed: string[] = [];
  for (const e of bundle.entries) {
    const sig = bundle.signatures[e.key];
    if (!sig) {
      failed.push(e.key);
      continue;
    }
    const key = keyStore.get(sig.keyId);
    if (!key) {
      failed.push(e.key);
      continue;
    }
    const expected = createHmac('sha256', key.privateKey ?? key.publicKey).update(e.digest).digest('base64');
    if (expected !== sig.signature) failed.push(e.key);
  }
  return { ok: failed.length === 0, failed };
}

/** Mark an algorithm as supported. */
export function isAlgorithmSupported(a: string): boolean {
  return (SIG_ALGORITHMS as readonly string[]).includes(a);
}

/** Deterministic test signature factory. */
export function makeTestKey(id: string): SignatureKeyPair {
  return {
    id,
    publicKey: `pk-${id}`,
    privateKey: `sk-${id}`,
  };
}