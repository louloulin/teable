/* eslint-disable @typescript-eslint/naming-convention */
import {
  computeExpiresAt,
  computeProgress,
  hasAlreadyDecided,
  isApproverFor,
  isExpiredBy,
  isValidDecision,
  isValidStatus,
  isValidStrategy,
  validateCastInput,
  validateRequestInput,
  validateWorkflowInput,
} from './approval-workflow.service';
import type { ICreateWorkflowInput } from './approval-workflow.types';

const baseWf: ICreateWorkflowInput = {
  baseId: 'b',
  tableId: 't',
  name: 'sample',
  strategy: 'all',
  approverIds: ['alice', 'bob', 'carol'],
};

describe('approval-workflow helpers (Stage 46)', () => {
  describe('validators', () => {
    it('accepts four strategies', () => {
      expect(isValidStrategy('any-one')).toBe(true);
      expect(isValidStrategy('all')).toBe(true);
      expect(isValidStrategy('majority')).toBe(true);
      expect(isValidStrategy('sequential')).toBe(true);
      expect(isValidStrategy('weird')).toBe(false);
    });
    it('accepts five statuses', () => {
      for (const s of ['pending', 'approved', 'rejected', 'cancelled', 'expired']) {
        expect(isValidStatus(s)).toBe(true);
      }
      expect(isValidStatus('open')).toBe(false);
    });
    it('accepts three decisions', () => {
      expect(isValidDecision('approve')).toBe(true);
      expect(isValidDecision('reject')).toBe(true);
      expect(isValidDecision('abstain')).toBe(true);
      expect(isValidDecision('maybe')).toBe(false);
    });
  });

  describe('validateWorkflowInput', () => {
    it('accepts a minimal input', () => {
      expect(() => validateWorkflowInput(baseWf)).not.toThrow();
    });
    it('rejects blank name', () => {
      expect(() => validateWorkflowInput({ ...baseWf, name: '   ' })).toThrow(/name/);
    });
    it('rejects empty approverIds', () => {
      expect(() => validateWorkflowInput({ ...baseWf, approverIds: [] })).toThrow(/approverIds/);
    });
    it('rejects duplicate approverIds', () => {
      expect(() => validateWorkflowInput({ ...baseWf, approverIds: ['a', 'a'] })).toThrow(
        /duplicate/
      );
    });
    it('rejects out-of-range threshold', () => {
      expect(() => validateWorkflowInput({ ...baseWf, threshold: 99 })).toThrow(/threshold/);
    });
    it('rejects negative expiresInHours', () => {
      expect(() => validateWorkflowInput({ ...baseWf, expiresInHours: 0 })).toThrow(
        /expiresInHours/
      );
    });
  });

  describe('validateRequestInput', () => {
    it('accepts a valid payload', () => {
      expect(() =>
        validateRequestInput({
          baseId: 'b',
          tableId: 't',
          recordId: 'r',
          workflowId: 'w',
          requesterUserId: 'u',
          payload: { a: 1 },
        })
      ).not.toThrow();
    });
    it('rejects missing recordId', () => {
      expect(() =>
        validateRequestInput({
          baseId: 'b',
          tableId: 't',
          recordId: '',
          workflowId: 'w',
          requesterUserId: 'u',
          payload: {},
        })
      ).toThrow(/recordId/);
    });
    it('rejects array payload', () => {
      expect(() =>
        validateRequestInput({
          baseId: 'b',
          tableId: 't',
          recordId: 'r',
          workflowId: 'w',
          requesterUserId: 'u',
          payload: [] as never,
        })
      ).toThrow(/payload/);
    });
  });

  describe('validateCastInput', () => {
    it('accepts a valid cast', () => {
      expect(() =>
        validateCastInput({ requestId: 'r1', approverUserId: 'u1', decision: 'approve' })
      ).not.toThrow();
    });
    it('rejects invalid decision', () => {
      expect(() =>
        validateCastInput({ requestId: 'r1', approverUserId: 'u1', decision: 'maybe' as never })
      ).toThrow();
    });
  });

  describe('isApproverFor / hasAlreadyDecided', () => {
    it('returns true for an approver', () => {
      expect(isApproverFor({ approverIds: ['a', 'b'] }, 'a')).toBe(true);
      expect(isApproverFor({ approverIds: ['a', 'b'] }, 'c')).toBe(false);
    });
    it('detects prior votes', () => {
      expect(hasAlreadyDecided([{ approverUserId: 'a' }, { approverUserId: 'b' }], 'a')).toBe(true);
      expect(hasAlreadyDecided([{ approverUserId: 'a' }], 'c')).toBe(false);
    });
  });

  describe('computeProgress', () => {
    const baseReq = { status: 'pending' as const, approverIds: ['a', 'b', 'c'] };

    it('any-one: approves on first approval', () => {
      const p = computeProgress(baseReq, [{ approverUserId: 'a', decision: 'approve' }], 'any-one');
      expect(p.status).toBe('approved');
      expect(p.decided).toBe(true);
    });
    it('any-one: rejects on first rejection', () => {
      const p = computeProgress(baseReq, [{ approverUserId: 'a', decision: 'reject' }], 'any-one');
      expect(p.status).toBe('rejected');
    });
    it('all: needs every approver to approve', () => {
      const one = computeProgress(baseReq, [{ approverUserId: 'a', decision: 'approve' }], 'all');
      expect(one.decided).toBe(false);
      const two = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'approve' },
        ],
        'all'
      );
      expect(two.decided).toBe(false);
      const all = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'approve' },
          { approverUserId: 'c', decision: 'approve' },
        ],
        'all'
      );
      expect(all.status).toBe('approved');
    });
    it('all: one rejection ends it', () => {
      const p = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'reject' },
        ],
        'all'
      );
      expect(p.status).toBe('rejected');
    });
    it('majority: 2 of 3 approves', () => {
      const p = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'approve' },
        ],
        'majority'
      );
      expect(p.status).toBe('approved');
    });
    it('majority with explicit threshold=2', () => {
      const p = computeProgress(
        baseReq,
        [{ approverUserId: 'a', decision: 'approve' }],
        'majority',
        2
      );
      expect(p.decided).toBe(false);
    });
    it('majority: impossible majority rejects', () => {
      const p = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'reject' },
          { approverUserId: 'b', decision: 'reject' },
        ],
        'majority'
      );
      expect(p.status).toBe('rejected');
    });
    it('sequential: rejects short-circuit', () => {
      const p = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'reject' },
        ],
        'sequential'
      );
      expect(p.status).toBe('rejected');
    });
    it('sequential: full approvals approve', () => {
      const p = computeProgress(
        baseReq,
        [
          { approverUserId: 'a', decision: 'approve' },
          { approverUserId: 'b', decision: 'approve' },
          { approverUserId: 'c', decision: 'approve' },
        ],
        'sequential'
      );
      expect(p.status).toBe('approved');
    });
    it('cancelled overrides', () => {
      const p = computeProgress({ status: 'cancelled', approverIds: ['a', 'b'] }, [], 'all');
      expect(p.status).toBe('cancelled');
      expect(p.decided).toBe(true);
    });
    it('expired status overrides', () => {
      const past = new Date(Date.now() - 1000);
      const p = computeProgress(baseReq, [], 'all', undefined, new Date(), past);
      expect(p.status).toBe('expired');
      expect(p.decided).toBe(true);
    });
  });

  describe('computeExpiresAt / isExpiredBy', () => {
    it('computes hours ahead', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const exp = computeExpiresAt(now, 24);
      expect(exp.getTime() - now.getTime()).toBe(24 * 3600_000);
    });
    it('isExpiredBy returns true past expiration', () => {
      const now = new Date();
      expect(isExpiredBy(new Date(now.getTime() - 1), now)).toBe(true);
      expect(isExpiredBy(undefined, now)).toBe(false);
    });
  });
});
