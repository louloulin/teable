/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import {
  BACKUP_CHECKSUM_ALG,
  BACKUP_ENVELOPE_ALG,
  BACKUP_ENVELOPE_VERSION,
  assertRestoreTargetAllowed,
  decryptPayload,
  deriveBackupKey,
  encryptPayload,
  sha256Checksum,
  unwrapFromArchive,
  verifyChecksum,
  wrapForArchive,
  type IBackupEnvelope,
} from './backup-integrity';

describe('backup-integrity.sha256Checksum', () => {
  it('produces sha256:<64 hex chars>', () => {
    const c = sha256Checksum(Buffer.from('hello'));
    expect(c.startsWith(`${BACKUP_CHECKSUM_ALG}:`)).toBe(true);
    expect(c.split(':')[1]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const a = sha256Checksum(Buffer.from('payload-1'));
    const b = sha256Checksum(Buffer.from('payload-1'));
    expect(a).toBe(b);
  });

  it('changes with input', () => {
    expect(sha256Checksum(Buffer.from('a'))).not.toBe(sha256Checksum(Buffer.from('b')));
  });
});

describe('backup-integrity.verifyChecksum', () => {
  it('does not throw on match', () => {
    const bytes = Buffer.from('round-trip');
    const c = sha256Checksum(bytes);
    expect(() => verifyChecksum(c, bytes)).not.toThrow();
  });

  it('throws BACKUP_CHECKSUM_MISMATCH on mismatch', () => {
    const err = (() => {
      try {
        verifyChecksum('sha256:00', Buffer.from('tampered'));
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_CHECKSUM_MISMATCH');
  });
});

describe('backup-integrity.encryptPayload / decryptPayload', () => {
  const key = deriveBackupKey('test-key-stable');

  it('roundtrips arbitrary bytes', () => {
    const plaintext = Buffer.from('confidential backup payload');
    const enc = encryptPayload(plaintext, key);
    expect(enc.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(enc.authTag).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(enc.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
    const dec = decryptPayload(enc.ciphertext, enc.iv, enc.authTag, key);
    expect(Buffer.from(dec).toString()).toBe('confidential backup payload');
  });

  it('produces a different IV per call (semantic security)', () => {
    const plaintext = Buffer.from('same plaintext');
    const a = encryptPayload(plaintext, key);
    const b = encryptPayload(plaintext, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.authTag).not.toBe(b.authTag);
  });

  it('rejects wrong-length keys (BACKUP_KEY_LENGTH)', () => {
    const err = (() => {
      try {
        encryptPayload(Buffer.from('x'), Buffer.alloc(16));
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_KEY_LENGTH');
  });

  it('rejects tampered ciphertext (BACKUP_AUTH_TAG_MISMATCH)', () => {
    const enc = encryptPayload(Buffer.from('payload'), key);
    // Flip a byte in the ciphertext
    const tampered = Buffer.from(enc.ciphertext, 'base64');
    tampered[0] = tampered[0] ^ 0xff;
    const tamperedB64 = tampered.toString('base64');
    const err = (() => {
      try {
        decryptPayload(tamperedB64, enc.iv, enc.authTag, key);
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_AUTH_TAG_MISMATCH');
  });

  it('rejects wrong key (BACKUP_AUTH_TAG_MISMATCH)', () => {
    const enc = encryptPayload(Buffer.from('payload'), key);
    const wrongKey = deriveBackupKey('attacker-key');
    const err = (() => {
      try {
        decryptPayload(enc.ciphertext, enc.iv, enc.authTag, wrongKey);
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_AUTH_TAG_MISMATCH');
  });
});

describe('backup-integrity.wrapForArchive / unwrapFromArchive', () => {
  const key = deriveBackupKey('roundtrip-key');

  it('roundtrips manifest + payload', () => {
    const manifest = { baseId: 'base1', tables: [{ id: 't1', name: 'Orders', recordCount: 5 }], totalRecords: 5, payloadBytes: 1024 };
    const payload = Buffer.from(JSON.stringify({ records: [{ id: 'r1' }] }));
    const envelope = wrapForArchive({ manifest, payload }, key);
    expect(envelope.v).toBe(BACKUP_ENVELOPE_VERSION);
    expect(envelope.alg).toBe(BACKUP_ENVELOPE_ALG);
    expect(envelope.checksum).toMatch(/^sha256:/);
    expect(envelope.manifest).toEqual(manifest);
    const result = unwrapFromArchive(envelope, key);
    expect(result.manifest).toEqual(manifest);
    expect(Buffer.from(result.payload).toString()).toBe(payload.toString());
  });

  it('is JSON-serializable (envelope can be written to any KV store)', () => {
    const envelope = wrapForArchive(
      { manifest: { hello: 'world' }, payload: Buffer.from('x') },
      key
    );
    const serialized = JSON.stringify(envelope);
    const restored = JSON.parse(serialized) as IBackupEnvelope;
    const result = unwrapFromArchive(restored, key);
    expect(result.manifest).toEqual({ hello: 'world' });
  });

  it('rejects unknown envelope version (BACKUP_VERSION_UNSUPPORTED)', () => {
    const env: IBackupEnvelope = {
      v: 999,
      alg: BACKUP_ENVELOPE_ALG,
      iv: 'AA==',
      authTag: 'AA==',
      checksum: 'sha256:00',
      manifest: {},
      ciphertext: 'AA==',
      producedAt: '2026-01-01T00:00:00Z',
    };
    const err = (() => {
      try { unwrapFromArchive(env, key); } catch (e) { return e as Error & { code: string }; }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_VERSION_UNSUPPORTED');
  });

  it('rejects unknown envelope algorithm (BACKUP_ALG_UNSUPPORTED)', () => {
    const env: IBackupEnvelope = {
      v: BACKUP_ENVELOPE_VERSION,
      alg: 'AES-256-CBC' as typeof BACKUP_ENVELOPE_ALG,
      iv: 'AA==',
      authTag: 'AA==',
      checksum: 'sha256:00',
      manifest: {},
      ciphertext: 'AA==',
      producedAt: '2026-01-01T00:00:00Z',
    };
    const err = (() => {
      try { unwrapFromArchive(env, key); } catch (e) { return e as Error & { code: string }; }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_ALG_UNSUPPORTED');
  });

  it('rejects tampered ciphertext (BACKUP_AUTH_TAG_MISMATCH)', () => {
    const env = wrapForArchive({ manifest: { x: 1 }, payload: Buffer.from('orig') }, key);
    const tampered: IBackupEnvelope = { ...env, ciphertext: env.ciphertext.replace(/[A-Z]/, 'A') };
    // Recompute checksum so we defeat the checksum layer, leaving only the auth tag check
    const ctBytes = Buffer.from(tampered.ciphertext, 'base64');
    tampered.checksum = sha256Checksum(ctBytes);
    const err = (() => {
      try { unwrapFromArchive(tampered, key); } catch (e) { return e as Error & { code: string }; }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(['BACKUP_AUTH_TAG_MISMATCH', 'BACKUP_CHECKSUM_MISMATCH']).toContain(err!.code);
  });
});

describe('backup-integrity.assertRestoreTargetAllowed', () => {
  it('allows same-base restore', () => {
    const r = assertRestoreTargetAllowed({ snapshotBaseId: 'base1', targetBaseId: 'base1' });
    expect(r.targetBaseId).toBe('base1');
  });

  it('blocks cross-base restore by default (BACKUP_CROSS_TENANT_BLOCKED)', () => {
    const err = (() => {
      try {
        assertRestoreTargetAllowed({ snapshotBaseId: 'base1', targetBaseId: 'base2' });
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_CROSS_TENANT_BLOCKED');
  });

  it('allows cross-base restore when allowCrossTenant=true', () => {
    const r = assertRestoreTargetAllowed({
      snapshotBaseId: 'base1',
      targetBaseId: 'base2',
      allowCrossTenant: true,
    });
    expect(r.targetBaseId).toBe('base2');
  });
});
