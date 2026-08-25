/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildDelivery,
  buildNotification,
  countUnread,
  defaultPreferences,
  extractMentions,
  isDeliveryExhausted,
  isInQuietHours,
  isValidChannel,
  isValidDeliveryStatus,
  isValidKind,
  markDeliveryFailed,
  markDeliverySent,
  markDeliverySkipped,
  markRead,
  resolveChannels,
  validateCreateInput,
  validatePreferences,
} from './notification-center.service';
import type { INotification } from './notification-center.types';

const baseInput = {
  baseId: 'b1',
  recipientUserId: 'u1',
  kind: 'mention' as const,
  title: 'You were mentioned',
  body: 'see this',
};

describe('notification-center helpers (Stage 45)', () => {
  describe('validators', () => {
    it('accepts the six kinds', () => {
      for (const k of [
        'mention',
        'comment-reply',
        'automation-run',
        'approval-request',
        'approval-decision',
        'system',
      ]) {
        expect(isValidKind(k)).toBe(true);
      }
      expect(isValidKind('unknown')).toBe(false);
    });
    it('accepts the four channels', () => {
      expect(isValidChannel('in-app')).toBe(true);
      expect(isValidChannel('email')).toBe(true);
      expect(isValidChannel('desktop')).toBe(true);
      expect(isValidChannel('webhook')).toBe(true);
      expect(isValidChannel('sms')).toBe(false);
    });
    it('accepts the four delivery statuses', () => {
      expect(isValidDeliveryStatus('pending')).toBe(true);
      expect(isValidDeliveryStatus('sent')).toBe(true);
      expect(isValidDeliveryStatus('failed')).toBe(true);
      expect(isValidDeliveryStatus('skipped')).toBe(true);
      expect(isValidDeliveryStatus('queued')).toBe(false);
    });
  });

  describe('validateCreateInput', () => {
    it('accepts a minimal input', () => {
      expect(() => validateCreateInput(baseInput)).not.toThrow();
    });
    it('rejects invalid kind', () => {
      expect(() => validateCreateInput({ ...baseInput, kind: 'nope' as never })).toThrow();
    });
    it('rejects blank title', () => {
      expect(() => validateCreateInput({ ...baseInput, title: '   ' })).toThrow(/title/);
    });
    it('rejects blank recipientUserId', () => {
      expect(() => validateCreateInput({ ...baseInput, recipientUserId: '' })).toThrow(/recipient/);
    });
    it('rejects blank baseId', () => {
      expect(() => validateCreateInput({ ...baseInput, baseId: '' })).toThrow(/baseId/);
    });
    it('rejects oversized title', () => {
      const long = 'x'.repeat(201);
      expect(() => validateCreateInput({ ...baseInput, title: long })).toThrow(/title/);
    });
    it('rejects oversized body', () => {
      const long = 'x'.repeat(2001);
      expect(() => validateCreateInput({ ...baseInput, body: long })).toThrow(/body/);
    });
  });

  describe('extractMentions', () => {
    it('returns an empty list when there are no mentions', () => {
      expect(extractMentions('hello world')).toEqual([]);
    });
    it('extracts single mention', () => {
      expect(extractMentions('hello @alice.42 how are you?')).toEqual(['alice.42']);
    });
    it('deduplicates', () => {
      expect(extractMentions('@alice @bob @alice')).toEqual(['alice', 'bob']);
    });
    it('ignores malformed mentions (too long)', () => {
      const long = '@' + 'x'.repeat(64);
      expect(extractMentions(long)).toEqual([]);
    });
    it('supports underscores and dots', () => {
      expect(extractMentions('cc @a_b.c please review')).toEqual(['a_b.c']);
    });
  });

  describe('isInQuietHours', () => {
    it('returns false when undefined', () => {
      expect(isInQuietHours(10, undefined, undefined)).toBe(false);
    });
    it('handles same start/end (no quiet hours)', () => {
      expect(isInQuietHours(10, 10, 10)).toBe(false);
    });
    it('handles normal window', () => {
      expect(isInQuietHours(22, 22, 6)).toBe(true);
      expect(isInQuietHours(0, 22, 6)).toBe(true);
      expect(isInQuietHours(12, 22, 6)).toBe(false);
    });
    it('handles non-wrapping window', () => {
      expect(isInQuietHours(8, 8, 18)).toBe(true);
      expect(isInQuietHours(20, 8, 18)).toBe(false);
    });
  });

  describe('defaultPreferences', () => {
    it('enables in-app and email by default', () => {
      const p = defaultPreferences('u1');
      expect(p.userId).toBe('u1');
      expect(p.channels.mention).toEqual(['in-app', 'email']);
      expect(p.channels.system).toEqual(['in-app', 'email']);
    });
  });

  describe('resolveChannels', () => {
    it('always includes in-app even if disabled', () => {
      const pref = {
        userId: 'u1',
        channels: {
          mention: ['email'] as never,
          'comment-reply': ['email'] as never,
          'automation-run': ['email'] as never,
          'approval-request': ['email'] as never,
          'approval-decision': ['email'] as never,
          system: ['email'] as never,
        },
      };
      const out = resolveChannels(pref, 'mention', 12);
      expect(out).toContain('in-app');
    });
    it('skips email/desktop during quiet hours', () => {
      const pref = {
        userId: 'u1',
        channels: {
          mention: ['in-app', 'email', 'desktop'] as never,
          'comment-reply': ['in-app'] as never,
          'automation-run': ['in-app'] as never,
          'approval-request': ['in-app'] as never,
          'approval-decision': ['in-app'] as never,
          system: ['in-app'] as never,
        },
        quietHoursStart: 22,
        quietHoursEnd: 6,
      };
      const out = resolveChannels(pref, 'mention', 23);
      expect(out).not.toContain('email');
      expect(out).not.toContain('desktop');
      expect(out).toContain('in-app');
    });
    it('includes email/desktop outside quiet hours', () => {
      const pref = {
        userId: 'u1',
        channels: {
          mention: ['in-app', 'email'] as never,
          'comment-reply': ['in-app'] as never,
          'automation-run': ['in-app'] as never,
          'approval-request': ['in-app'] as never,
          'approval-decision': ['in-app'] as never,
          system: ['in-app'] as never,
        },
        quietHoursStart: 22,
        quietHoursEnd: 6,
      };
      const out = resolveChannels(pref, 'mention', 10);
      expect(out).toContain('email');
    });
  });

  describe('buildNotification', () => {
    it('builds a row with readAt=null', () => {
      const n = buildNotification('n1', baseInput);
      expect(n.id).toBe('n1');
      expect(n.readAt).toBeNull();
      expect(n.kind).toBe('mention');
    });
  });

  describe('buildDelivery', () => {
    it('initializes as pending', () => {
      const d = buildDelivery('d1', 'n1', 'email');
      expect(d.status).toBe('pending');
      expect(d.attempts).toBe(0);
    });
  });

  describe('markDelivery*', () => {
    it('markDeliverySent sets sentAt + bumps attempts', () => {
      const d = buildDelivery('d1', 'n1', 'email');
      const s = markDeliverySent(d);
      expect(s.status).toBe('sent');
      expect(s.attempts).toBe(1);
      expect(s.sentAt).toBeInstanceOf(Date);
    });
    it('markDeliveryFailed records error', () => {
      const d = buildDelivery('d1', 'n1', 'email');
      const f = markDeliveryFailed(d, 'SMTP 421');
      expect(f.status).toBe('failed');
      expect(f.lastError).toBe('SMTP 421');
      expect(f.attempts).toBe(1);
    });
    it('markDeliveryFailed truncates long errors', () => {
      const d = buildDelivery('d1', 'n1', 'email');
      const f = markDeliveryFailed(d, 'x'.repeat(800));
      expect((f.lastError ?? '').length).toBe(500);
    });
    it('markDeliverySkipped marks status', () => {
      const d = buildDelivery('d1', 'n1', 'email');
      const s = markDeliverySkipped(d);
      expect(s.status).toBe('skipped');
    });
    it('isDeliveryExhausted respects the cap', () => {
      let d = buildDelivery('d1', 'n1', 'email');
      for (let i = 0; i < 3; i++) d = markDeliveryFailed(d, 'e');
      expect(isDeliveryExhausted(d)).toBe(true);
      expect(isDeliveryExhausted(d, 5)).toBe(false);
    });
  });

  describe('markRead', () => {
    it('sets readAt the first time', () => {
      const n: INotification = {
        id: 'n1',
        baseId: 'b',
        recipientUserId: 'u',
        kind: 'mention',
        title: 't',
        body: 'b',
        readAt: null,
        createdTime: new Date(),
      };
      const r = markRead(n);
      expect(r.readAt).toBeInstanceOf(Date);
    });
    it('is idempotent', () => {
      const at = new Date('2026-01-01');
      const n: INotification = {
        id: 'n1',
        baseId: 'b',
        recipientUserId: 'u',
        kind: 'mention',
        title: 't',
        body: 'b',
        readAt: at,
        createdTime: new Date(),
      };
      expect(markRead(n)).toBe(n);
    });
  });

  describe('countUnread', () => {
    it('counts only readAt=null', () => {
      const mk = (readAt: Date | null): INotification => ({
        id: 'x',
        baseId: 'b',
        recipientUserId: 'u',
        kind: 'mention',
        title: 't',
        body: 'b',
        readAt,
        createdTime: new Date(),
      });
      expect(countUnread([mk(null), mk(null), mk(new Date())])).toBe(2);
      expect(countUnread([])).toBe(0);
    });
  });

  describe('validatePreferences', () => {
    it('accepts a default preference', () => {
      expect(() => validatePreferences(defaultPreferences('u1'))).not.toThrow();
    });
    it('rejects invalid channel', () => {
      const p = defaultPreferences('u1');
      p.channels.mention = ['sms' as never];
      expect(() => validatePreferences(p)).toThrow(/channel/);
    });
    it('rejects out-of-range quietHoursStart', () => {
      const p = defaultPreferences('u1');
      p.quietHoursStart = 25;
      expect(() => validatePreferences(p)).toThrow(/quietHoursStart/);
    });
  });
});
