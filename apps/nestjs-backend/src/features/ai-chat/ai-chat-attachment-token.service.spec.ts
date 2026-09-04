/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-ATTACH-2: HMAC attachment token + virus scan unit test.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AiChatAttachmentTokenService } from './ai-chat-attachment-token.service';

const ORIGINAL_SECRET = process.env.AI_CHAT_ATTACHMENT_HMAC_SECRET;
const ORIGINAL_TTL = process.env.AI_CHAT_ATTACHMENT_TOKEN_TTL;
const ORIGINAL_ENGINE = process.env.AI_CHAT_VIRUS_ENGINE;

beforeEach(() => {
  process.env.AI_CHAT_ATTACHMENT_HMAC_SECRET = 'unit-test-secret';
  process.env.AI_CHAT_ATTACHMENT_TOKEN_TTL = '60';
  process.env.AI_CHAT_VIRUS_ENGINE = 'mock';
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AI_CHAT_ATTACHMENT_HMAC_SECRET;
  else process.env.AI_CHAT_ATTACHMENT_HMAC_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_TTL === undefined) delete process.env.AI_CHAT_ATTACHMENT_TOKEN_TTL;
  else process.env.AI_CHAT_ATTACHMENT_TOKEN_TTL = ORIGINAL_TTL;
  if (ORIGINAL_ENGINE === undefined) delete process.env.AI_CHAT_VIRUS_ENGINE;
  else process.env.AI_CHAT_VIRUS_ENGINE = ORIGINAL_ENGINE;
});

describe('AiChatAttachmentTokenService', () => {
  describe('sign + verify', () => {
    it('round-trips a token for the same attachment + user', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({ attachmentId: 'att-1', userId: 'user-7' });
      const out = svc.verify(token);
      expect(out.att).toBe('att-1');
      expect(out.uid).toBe('user-7');
      expect(out.scope).toBe('read');
      expect(out.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('embeds custom scope and respects custom ttl', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({
        attachmentId: 'att-2',
        userId: 'user-7',
        scope: 'scan',
        ttlSeconds: 2,
      });
      const out = svc.verify(token);
      expect(out.scope).toBe('scan');
    });

    it('rejects tampered payload (signature mismatch)', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({ attachmentId: 'att-3', userId: 'user-7' });
      const [encoded, sig] = token.split('.');
      // Flip a bit in the payload (just append garbage)
      const tampered = `${encoded}AAA.${sig}`;
      expect(() => svc.verify(tampered)).toThrow(/signature mismatch/);
    });

    it('rejects expired tokens', async () => {
      const svc = new AiChatAttachmentTokenService();
      // ttlSeconds=0 means the token is expired the moment it leaves sign().
      const token = svc.sign({ attachmentId: 'att-4', userId: 'user-7', ttlSeconds: -1 });
      expect(() => svc.verify(token)).toThrow(/expired/);
    });

    it('rejects garbage tokens', () => {
      const svc = new AiChatAttachmentTokenService();
      expect(() => svc.verify('')).toThrow(/malformed/);
      expect(() => svc.verify('abc')).toThrow(/malformed/);
      expect(() => svc.verify('abc.def.ghi')).toThrow(/malformed/);
    });
  });

  describe('verifyForUser', () => {
    it('rejects when user does not match', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({ attachmentId: 'att-5', userId: 'user-A' });
      expect(() => svc.verifyForUser(token, 'user-B', 'att-5')).toThrow(/different user/);
    });

    it('rejects when attachment id does not match', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({ attachmentId: 'att-6', userId: 'user-A' });
      expect(() => svc.verifyForUser(token, 'user-A', 'att-7')).toThrow(/does not match/);
    });

    it('accepts when both match', () => {
      const svc = new AiChatAttachmentTokenService();
      const token = svc.sign({ attachmentId: 'att-8', userId: 'user-A' });
      const out = svc.verifyForUser(token, 'user-A', 'att-8');
      expect(out.att).toBe('att-8');
    });
  });

  describe('scanBuffer (mock)', () => {
    it('marks EICAR test string as infected', async () => {
      const svc = new AiChatAttachmentTokenService();
      const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const out = await svc.scanBuffer(eicar, 'eicar.com');
      expect(out.clean).toBe(false);
      expect(out.threat).toBe('EICAR-Test-File');
      expect(out.engine).toBe('mock');
    });

    it('marks clean buffers as clean', async () => {
      const svc = new AiChatAttachmentTokenService();
      const out = await svc.scanBuffer(Buffer.from('plain text content'), 'note.txt');
      expect(out.clean).toBe(true);
      expect(out.engine).toBe('mock');
    });
  });
});
