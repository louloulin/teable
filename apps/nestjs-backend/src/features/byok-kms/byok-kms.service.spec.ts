/* eslint-disable @typescript-eslint/naming-convention */
import {
  daysUntilRotation,
  decryptWithDek,
  encryptWithDek,
  envelopeHash,
  generateAlias,
  generateDek,
  isRotationDue,
  isValidAlias,
  parseRotationPolicy,
  stringifyRotationPolicy,
  unwrapDek,
  wrapDek,
} from './byok-kms.service';

describe('BYOK KMS helpers (Stage 35)', () => {
  describe('generateAlias / isValidAlias', () => {
    it('generates kebab-case alias with random tail', () => {
      const a = generateAlias('My Key!');
      expect(a).toMatch(/^[a-z0-9-]+-[a-f0-9]{8}$/);
    });

    it('rejects bad alias shape', () => {
      expect(isValidAlias('ok')).toBe(false);
      expect(isValidAlias('UPPER')).toBe(false);
      expect(isValidAlias('-bad')).toBe(false);
      expect(isValidAlias('bad-')).toBe(false);
      expect(isValidAlias('good-one')).toBe(true);
    });
  });

  describe('envelope encryption round-trip', () => {
    it('wraps and unwraps a DEK', () => {
      const dek = generateDek();
      const master = generateDek();
      const env = wrapDek({ dek, masterKey: master, keyId: 'k1', keyVersion: 'v1' });
      expect(env.algorithm).toBe('AES-256-GCM');
      const out = unwrapDek({ envelope: env, masterKey: master });
      expect(out.raw.equals(dek)).toBe(true);
      expect(out.keyId).toBe('k1');
    });

    it('rejects wrong master key length', () => {
      expect(() =>
        wrapDek({ dek: generateDek(), masterKey: Buffer.alloc(16), keyId: 'k' })
      ).toThrow(/32 bytes/);
    });

    it('detects tampering via GCM auth tag', () => {
      const dek = generateDek();
      const master = generateDek();
      const env = wrapDek({ dek, masterKey: master, keyId: 'k1' });
      const buf = Buffer.from(env.wrappedDek, 'base64');
      buf[buf.length - 1] ^= 0x01;
      const tampered: typeof env = { ...env, wrappedDek: buf.toString('base64') };
      expect(() => unwrapDek({ envelope: tampered, masterKey: master })).toThrow();
    });

    it('rejects unsupported algorithm', () => {
      expect(() =>
        unwrapDek({
          envelope: { keyId: 'k', wrappedDek: 'AA==', algorithm: 'AES-128', keyVersion: null },
          masterKey: generateDek(),
        })
      ).toThrow(/algorithm/);
    });
  });

  describe('encryptWithDek / decryptWithDek', () => {
    it('round-trips arbitrary plaintext', () => {
      const dek = generateDek();
      const pt = Buffer.from('hello world 12345');
      const ct = encryptWithDek({ dek, plaintext: pt });
      const out = decryptWithDek({ dek, blob: ct });
      expect(out.equals(pt)).toBe(true);
    });

    it('fails on truncated ciphertext', () => {
      expect(() => decryptWithDek({ dek: generateDek(), blob: Buffer.alloc(5) })).toThrow(
        /too short/
      );
    });
  });

  describe('envelopeHash', () => {
    it('produces a stable hash', () => {
      const env = wrapDek({ dek: generateDek(), masterKey: generateDek(), keyId: 'k' });
      const h1 = envelopeHash(env);
      const h2 = envelopeHash(env);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('rotation policy', () => {
    it('parses + stringifies round-trip', () => {
      const p = { rotateAfterDays: 90, notifyBeforeDays: 7 };
      expect(parseRotationPolicy(stringifyRotationPolicy(p))).toEqual(p);
    });

    it('returns null on bad json', () => {
      expect(parseRotationPolicy(null)).toBeNull();
      expect(parseRotationPolicy('not json')).toBeNull();
      expect(parseRotationPolicy('{"rotateAfterDays":"nope"}')).toBeNull();
    });

    it('detects rotation due', () => {
      const now = new Date('2026-09-01T00:00:00Z');
      const key = {
        id: 'k',
        organizationId: 'o',
        alias: 'a',
        provider: 'local' as const,
        keyId: 'k',
        keyVersion: null,
        status: 'enabled' as const,
        rotationPolicy: { rotateAfterDays: 30 },
        createdBy: 'u',
        createdTime: new Date('2026-07-01T00:00:00Z'),
        updatedTime: new Date(),
        lastUsedAt: null,
      };
      expect(isRotationDue({ key, now })).toBe(true);
      expect(daysUntilRotation({ key, now })).toBeLessThanOrEqual(0);
    });

    it('returns false when policy disabled', () => {
      const key = {
        id: 'k',
        organizationId: 'o',
        alias: 'a',
        provider: 'local' as const,
        keyId: 'k',
        keyVersion: null,
        status: 'enabled' as const,
        rotationPolicy: { rotateAfterDays: 0 },
        createdBy: 'u',
        createdTime: new Date('2026-01-01T00:00:00Z'),
        updatedTime: new Date(),
        lastUsedAt: null,
      };
      expect(isRotationDue({ key, now: new Date('2030-01-01T00:00:00Z') })).toBe(false);
      expect(daysUntilRotation({ key, now: new Date('2030-01-01T00:00:00Z') })).toBeNull();
    });

    it('returns false when policy is null', () => {
      const key = {
        id: 'k',
        organizationId: 'o',
        alias: 'a',
        provider: 'local' as const,
        keyId: 'k',
        keyVersion: null,
        status: 'enabled' as const,
        rotationPolicy: null,
        createdBy: 'u',
        createdTime: new Date('2020-01-01T00:00:00Z'),
        updatedTime: new Date(),
        lastUsedAt: null,
      };
      expect(isRotationDue({ key, now: new Date() })).toBe(false);
    });
  });
});
