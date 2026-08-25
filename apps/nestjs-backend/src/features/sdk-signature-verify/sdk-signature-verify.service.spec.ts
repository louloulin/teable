/**
 * SDK Signature Verify — pure helpers spec (Stage 121).
 */

import {
  buildBundle,
  digest,
  isAlgorithmSupported,
  makeTestKey,
  sign,
  signArtifact,
  verify,
  verifyArtifact,
  verifyBundle,
} from './sdk-signature-verify.service';

describe('sdk-signature-verify.digest', () => {
  it('sha256 hex', () => {
    expect(digest('hello')).toHaveLength(64);
  });
  it('stable', () => {
    expect(digest('hello')).toBe(digest('hello'));
  });
  it('different', () => {
    expect(digest('a')).not.toBe(digest('b'));
  });
});

describe('sdk-signature-verify.isAlgorithmSupported', () => {
  it('ed25519', () => {
    expect(isAlgorithmSupported('ed25519')).toBe(true);
  });
  it('rsa', () => {
    expect(isAlgorithmSupported('rsa-sha256')).toBe(true);
  });
  it('unknown', () => {
    expect(isAlgorithmSupported('rsa-md5')).toBe(false);
  });
});

describe('sdk-signature-verify.signArtifact + verify', () => {
  it('round trip', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a.tgz', 'hello', 'ed25519');
    expect(verify(k, a).ok).toBe(true);
  });
  it('wrong key fails', () => {
    const k = makeTestKey('k1');
    const k2 = makeTestKey('k2');
    const a = signArtifact(k, 'a.tgz', 'hello', 'ed25519');
    expect(verify(k2, a).ok).toBe(false);
  });
  it('missing key', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    expect(verify(undefined, a).ok).toBe(false);
  });
  it('algorithm mismatch', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    a.signature.algorithm = 'unknown' as 'ed25519';
    expect(verify(k, a).ok).toBe(false);
  });
  it('malformed', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    a.signature.signature = '';
    expect(verify(k, a).ok).toBe(false);
  });
});

describe('sdk-signature-verify.verifyArtifact via keyStore', () => {
  it('ok', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    const store = new Map([['k1', k]]);
    expect(verifyArtifact(store, a).ok).toBe(true);
  });
  it('missing key', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    expect(verifyArtifact(new Map(), a).ok).toBe(false);
  });
});

describe('sdk-signature-verify.sign without private key', () => {
  it('throws', () => {
    expect(() => sign({ id: 'k', publicKey: 'pk' }, 'x', 'ed25519')).toThrow();
  });
});

describe('sdk-signature-verify.bundle', () => {
  it('build', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    const b = signArtifact(k, 'b', 'y', 'ed25519');
    const bundle = buildBundle([a, b]);
    expect(bundle.entries.length).toBe(2);
    expect(Object.keys(bundle.signatures).length).toBe(2);
  });
  it('verify ok', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    const bundle = buildBundle([a]);
    expect(verifyBundle(new Map([['k1', k]]), bundle).ok).toBe(true);
  });
  it('verify fails when tampered', () => {
    const k = makeTestKey('k1');
    const a = signArtifact(k, 'a', 'x', 'ed25519');
    const bundle = buildBundle([a]);
    bundle.entries[0].digest = 'tampered';
    expect(verifyBundle(new Map([['k1', k]]), bundle).ok).toBe(false);
  });
});