/* eslint-disable @typescript-eslint/naming-convention */
import {
  authTagBytes,
  byteLengthUtf8,
  buildEnvelope,
  canDecryptWith,
  decryptWithDek,
  encryptWithDek,
  fromBase64,
  isValidAlgorithm,
  isValidKeyState,
  makeDek,
  makeIv,
  parseEnvelope,
  pickEncryptionKey,
  randomBytes,
  toBase64,
  validateCreateKeyInput,
  validateEncryptInput,
} from './kms-encryption.service';
import {
  DEFAULT_ENCRYPTION_ALGORITHM,
  DEFAULT_IV_BYTES,
  DEFAULT_DEK_BYTES,
  MAX_PLAINTEXT_BYTES,
} from './kms-encryption.types';
import type { IEncryptionKey } from './kms-encryption.types';

function mkKey(over: Partial<IEncryptionKey> = {}): IEncryptionKey {
  return {
    id: 'ek_1',
    kid: 'kms-prod-1',
    algorithm: 'AES-256-GCM',
    state: 'enabled',
    createdTime: new Date('2024-01-01T00:00:00Z'),
    ...over,
  };
}

describe('kms-encryption.validators', () => {
  describe('isValidAlgorithm', () => {
    it('accepts AES-256-GCM', () => {
      expect(isValidAlgorithm('AES-256-GCM')).toBe(true);
    });
    it('rejects unknown', () => {
      expect(isValidAlgorithm('AES-128-CBC')).toBe(false);
    });
  });

  describe('isValidKeyState', () => {
    it('accepts enabled/disabled/compromised', () => {
      for (const s of ['enabled', 'disabled', 'compromised']) {
        expect(isValidKeyState(s)).toBe(true);
      }
    });
    it('rejects unknown', () => {
      expect(isValidKeyState('archived')).toBe(false);
    });
  });

  describe('validateCreateKeyInput', () => {
    it('accepts minimal valid input', () => {
      expect(() => validateCreateKeyInput({ kid: 'k1' })).not.toThrow();
    });
    it('requires kid', () => {
      expect(() => validateCreateKeyInput({ kid: '' })).toThrow();
    });
    it('rejects too-long kid', () => {
      expect(() => validateCreateKeyInput({ kid: 'x'.repeat(200) })).toThrow();
    });
    it('rejects invalid algorithm', () => {
      expect(() =>
        validateCreateKeyInput({ kid: 'k1', algorithm: 'AES-128-CBC' as never })
      ).toThrow();
    });
  });

  describe('validateEncryptInput', () => {
    it('requires plaintext string', () => {
      expect(() => validateEncryptInput({ plaintext: 123 as never })).toThrow();
    });
    it('rejects oversized plaintext', () => {
      const huge = 'x'.repeat(MAX_PLAINTEXT_BYTES + 1);
      expect(() => validateEncryptInput({ plaintext: huge })).toThrow();
    });
    it('accepts a small plaintext', () => {
      expect(() => validateEncryptInput({ plaintext: 'hello' })).not.toThrow();
    });
  });
});

describe('kms-encryption.encoding', () => {
  it('byteLengthUtf8 matches TextEncoder', () => {
    expect(byteLengthUtf8('hello')).toBe(5);
    expect(byteLengthUtf8('你好')).toBe(6);
  });

  it('toBase64 / fromBase64 round-trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254]);
    const b64 = toBase64(bytes);
    expect(b64.length).toBeGreaterThan(0);
    const out = fromBase64(b64);
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('randomBytes produces length-correct output', () => {
    expect(randomBytes(0)).toHaveLength(0);
    const r = randomBytes(16);
    expect(r).toHaveLength(16);
    expect(Array.from(r).every((b) => b >= 0 && b < 256)).toBe(true);
  });

  it('makeIv / makeDek default sizes', () => {
    expect(makeIv()).toHaveLength(DEFAULT_IV_BYTES);
    expect(makeDek()).toHaveLength(DEFAULT_DEK_BYTES);
  });
});

describe('kms-encryption.crypto', () => {
  it('encryptWithDek / decryptWithDek round-trip', () => {
    const dek = makeDek();
    const iv = makeIv();
    const plaintext = new TextEncoder().encode('hello world');
    const cipher = encryptWithDek(plaintext, dek, iv);
    const plain = decryptWithDek(cipher, dek, iv);
    expect(Array.from(plain)).toEqual(Array.from(plaintext));
  });

  it('encryptWithDek differs when iv changes', () => {
    const dek = makeDek();
    const plaintext = new TextEncoder().encode('hello world');
    const a = encryptWithDek(plaintext, dek, makeIv());
    const b = encryptWithDek(plaintext, dek, makeIv());
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('aad mixing produces different ciphertext', () => {
    const dek = makeDek();
    const iv = makeIv();
    const plaintext = new TextEncoder().encode('hello');
    const a = encryptWithDek(plaintext, dek, iv);
    const b = encryptWithDek(plaintext, dek, iv, new TextEncoder().encode('aad'));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('kms-encryption.envelopes', () => {
  it('buildEnvelope / parseEnvelope round-trip', () => {
    const iv = makeIv();
    const cipher = new Uint8Array([1, 2, 3, 4]);
    const env = buildEnvelope({
      kid: 'k1',
      iv,
      ciphertext: cipher,
      aad: 'context',
    });
    expect(env.kid).toBe('k1');
    expect(env.algorithm).toBe(DEFAULT_ENCRYPTION_ALGORITHM);
    expect(env.iv).toBe(toBase64(iv));
    expect(env.ciphertext).toBe(toBase64(cipher));
    expect(env.aad).toBe('context');
    const parsed = parseEnvelope(env);
    expect(Array.from(parsed.iv)).toEqual(Array.from(iv));
    expect(Array.from(parsed.ciphertext)).toEqual(Array.from(cipher));
    expect(parsed.aad && new TextDecoder().decode(parsed.aad)).toBe('context');
  });

  it('parseEnvelope rejects missing fields', () => {
    expect(() =>
      parseEnvelope({ kid: '', iv: '', ciphertext: '', algorithm: 'AES-256-GCM' })
    ).toThrow();
  });

  it('authTagBytes returns correct bytes for default tag', () => {
    expect(authTagBytes()).toBe(16);
    expect(authTagBytes(64)).toBe(8);
  });
});

describe('kms-encryption.key-policies', () => {
  it('pickEncryptionKey returns enabled key matching kid', () => {
    const keys = [
      mkKey({ kid: 'old' }),
      mkKey({ kid: 'new', createdTime: new Date('2024-02-01') }),
    ];
    expect(pickEncryptionKey(keys, 'old').kid).toBe('old');
  });

  it('pickEncryptionKey rejects disabled key', () => {
    const keys = [mkKey({ state: 'disabled' })];
    expect(() => pickEncryptionKey(keys, 'kms-prod-1')).toThrow(/not enabled/);
  });

  it('pickEncryptionKey rejects unknown kid', () => {
    expect(() => pickEncryptionKey([mkKey()], 'nope')).toThrow();
  });

  it('pickEncryptionKey returns most-recent when no kid given', () => {
    const older = mkKey({ kid: 'older', createdTime: new Date('2024-01-01') });
    const newer = mkKey({ kid: 'newer', createdTime: new Date('2024-06-01') });
    expect(pickEncryptionKey([older, newer]).kid).toBe('newer');
  });

  it('pickEncryptionKey throws when no enabled keys', () => {
    expect(() => pickEncryptionKey([mkKey({ state: 'disabled' })])).toThrow(/no enabled/);
  });
});

describe('kms-encryption.canDecryptWith', () => {
  const env = { kid: 'kms-prod-1', iv: 'aa', ciphertext: 'bb', algorithm: 'AES-256-GCM' as const };
  it('rejects unknown kid', () => {
    expect(canDecryptWith(env, [])).toEqual({ ok: false, reason: 'kid not found' });
  });
  it('rejects compromised key', () => {
    expect(canDecryptWith(env, [mkKey({ state: 'compromised' })])).toEqual({
      ok: false,
      reason: 'key marked compromised',
    });
  });
  it('rejects retired key', () => {
    const past = new Date('2024-01-01');
    expect(canDecryptWith(env, [mkKey({ retiredAt: past })], new Date('2024-02-01'))).toEqual({
      ok: false,
      reason: 'key retired',
    });
  });
  it('allows enabled key', () => {
    expect(canDecryptWith(env, [mkKey()])).toEqual({ ok: true });
  });
  it('allows disabled key for legacy ciphertext', () => {
    expect(canDecryptWith(env, [mkKey({ state: 'disabled' })])).toEqual({ ok: true });
  });
  it('rejects unknown algorithm', () => {
    expect(canDecryptWith({ ...env, algorithm: 'AES-128-CBC' as never }, [mkKey()])).toEqual({
      ok: false,
      reason: 'unsupported algorithm',
    });
  });
});
