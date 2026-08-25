import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  currentCounter,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  hotp,
  nextWindowAt,
  totp,
  verifyCode,
} from './totp.service';

describe('TOTP helpers (Stage 22)', () => {
  describe('base32', () => {
    it('round-trips arbitrary buffers', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
      const enc = base32Encode(buf);
      expect(enc).toMatch(/^[A-Z2-7]+$/);
      expect(base32Decode(enc).equals(buf)).toBe(true);
    });

    it('rejects out-of-alphabet chars on decode', () => {
      expect(() => base32Decode('NOT0BASE!!')).toThrow(/invalid base32/);
    });
  });

  describe('generateSecret', () => {
    it('produces a base32 string of the requested byte length', () => {
      const s = generateSecret(20);
      // 20 bytes -> 32 base32 chars (5 bits per char, no padding).
      expect(s).toHaveLength(32);
      expect(s).toMatch(/^[A-Z2-7]+$/);
    });

    it('two invocations are different', () => {
      expect(generateSecret(20)).not.toBe(generateSecret(20));
    });
  });

  describe('currentCounter + hotp', () => {
    it('produces a stable 6-digit code for a fixed counter', () => {
      const secret = base32Decode('JBSWY3DPEHPK3PXP');
      const code = hotp(secret, 1n, 6, 'SHA1');
      expect(code).toMatch(/^\d{6}$/);
      // RFC 4226 §5.4 test vector for the "12345678901234567890" key at counter 1.
      const knownKey = base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
      expect(hotp(knownKey, 1n, 6, 'SHA1')).toBe('287082');
    });

    it('currentCounter increases with time', () => {
      const a = currentCounter(1_000_000_000, 30);
      const b = currentCounter(1_000_000_000 + 60_000, 30);
      expect(b - a).toBe(2n);
    });
  });

  describe('totp', () => {
    it('matches HOTP at the current counter', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const now = 1_700_000_000_000;
      const code = totp({ secret, digits: 6, period: 30, algorithm: 'SHA1' }, now);
      const c = currentCounter(now, 30);
      expect(code).toBe(hotp(base32Decode(secret), c, 6, 'SHA1'));
    });
  });

  describe('verifyCode', () => {
    const factor = {
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1' as const,
      lastCounter: 0n,
    };
    it('accepts the code at the current step', () => {
      const now = 1_700_000_000_000;
      const expected = totp(factor, now);
      expect(verifyCode(factor, expected, now)).not.toBeNull();
    });

    it('accepts the code at ±1 step (clock skew window)', () => {
      const now = 1_700_000_000_000;
      const expected = totp({ ...factor, period: 30 }, now + 30_000);
      expect(verifyCode(factor, expected, now)).not.toBeNull();
    });

    it('rejects an obviously wrong code', () => {
      expect(verifyCode(factor, '000000', Date.now())).toBeNull();
    });

    it('rejects non-numeric input', () => {
      expect(verifyCode(factor, 'abcdef', Date.now())).toBeNull();
    });

    it('rejects replay within the window', () => {
      const now = 1_700_000_000_000;
      const expected = totp(factor, now);
      const used = verifyCode(factor, expected, now);
      expect(used).not.toBeNull();
      // After advancing lastCounter, the same code must not be accepted.
      const advanced = { ...factor, lastCounter: used ?? 1n };
      expect(verifyCode(advanced, expected, now)).toBeNull();
    });
  });

  describe('buildOtpauthUri', () => {
    it('emits an otpauth:// URL with all parameters', () => {
      const uri = buildOtpauthUri({
        secret: 'JBSWY3DPEHPK3PXP',
        label: 'alice@example.com',
        issuer: 'Acme',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
      });
      expect(uri.startsWith('otpauth://totp/Acme%3Aalice%40example.com?')).toBe(true);
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=Acme');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
      expect(uri).toContain('algorithm=SHA1');
    });
  });

  describe('backup codes', () => {
    it('generates N unique codes of the expected length', () => {
      const codes = generateBackupCodes(10);
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      for (const c of codes) {
        expect(c).toMatch(/^[a-z2-7]{8}$/);
      }
    });

    it('hashes are stable + lowercase', () => {
      expect(hashBackupCode('ABCDEFGH')).toBe(hashBackupCode('abcdefgh'));
      expect(hashBackupCode('  abcdefgh  ')).toBe(hashBackupCode('abcdefgh'));
      expect(hashBackupCode('abcdefgh')).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('nextWindowAt', () => {
    it('returns the next 30s boundary after now', () => {
      const t = nextWindowAt(30, 1_700_000_005_000);
      expect(t % 30_000).toBe(0);
      expect(t).toBeGreaterThan(1_700_000_005_000);
    });
  });
});
