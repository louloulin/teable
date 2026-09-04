/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-1: AI Chat selection ref service — unit tests.
 *
 * Mocks PrismaService + PermissionService so we test pure logic:
 *   - validation (selectionType enum, refKey/label length, refValue shape)
 *   - ownership + permission checks
 *   - upsert idempotency on (sessionId, refKey)
 *   - clearTable scope
 *   - renderPrompt grouping by tableId
 *
 * Total: 9 test cases.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiChatSelectionRefService } from './ai-chat-selection-ref.service';

const SESSION_ID = 'sess_1';
const USER_ID = 'user_1';
const BASE_ID = 'bse_1';
const TABLE_A = 'tblA';
const TABLE_B = 'tblB';

type PrismaDelegate = Record<string, ReturnType<typeof vi.fn>>;

function createPrismaStub() {
  const sessionDelegate: PrismaDelegate = {
    findUnique: vi.fn(),
  };
  const refDelegate: PrismaDelegate = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    aiChatSession: sessionDelegate,
    aiChatSelectionRef: refDelegate,
    aiChatSelectionRefUpsert: vi.fn(),
    __session: sessionDelegate,
    __ref: refDelegate,
  } as unknown as {
    aiChatSession: PrismaDelegate;
    aiChatSelectionRef: PrismaDelegate;
  } & {
    __session: PrismaDelegate;
    __ref: PrismaDelegate;
  };
}

function createPermStub() {
  return {
    validPermissions: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AiChatSelectionRefService (R-CHAT-1)', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let perm: ReturnType<typeof createPermStub>;
  let svc: AiChatSelectionRefService;

  beforeEach(() => {
    prisma = createPrismaStub();
    perm = createPermStub();
    svc = new AiChatSelectionRefService(
      prisma as never,
      perm as never
    );
  });

  function sessionOwned(opts: { baseId?: string | null } = {}) {
    return {
      id: SESSION_ID,
      createdBy: USER_ID,
      baseId: opts.baseId === undefined ? BASE_ID : opts.baseId,
    };
  }

  it('rejects unknown session with NotFoundException', async () => {
    prisma.__session.findUnique.mockResolvedValue(null);
    await expect(svc.list(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when caller is not session owner', async () => {
    prisma.__session.findUnique.mockResolvedValue({ ...sessionOwned(), createdBy: 'someone-else' });
    await expect(svc.list(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates selectionType enum', async () => {
    prisma.__session.findUnique.mockResolvedValue(sessionOwned());
    prisma.__ref.upsert.mockResolvedValue({});
    await expect(
      svc.add({
        sessionId: SESSION_ID,
        userId: USER_ID,
        tableId: TABLE_A,
        selectionType: 'invalid' as never,
        refKey: 'k1',
        refValue: {},
        displayLabel: 'L',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty refKey / empty displayLabel', async () => {
    prisma.__session.findUnique.mockResolvedValue(sessionOwned());
    prisma.__ref.upsert.mockResolvedValue({});
    await expect(
      svc.add({
        sessionId: SESSION_ID,
        userId: USER_ID,
        tableId: TABLE_A,
        selectionType: 'row',
        refKey: '',
        refValue: {},
        displayLabel: 'L',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.add({
        sessionId: SESSION_ID,
        userId: USER_ID,
        tableId: TABLE_A,
        selectionType: 'row',
        refKey: 'k',
        refValue: {},
        displayLabel: '',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects refValue that is not an object', async () => {
    prisma.__session.findUnique.mockResolvedValue(sessionOwned());
    prisma.__ref.upsert.mockResolvedValue({});
    await expect(
      svc.add({
        sessionId: SESSION_ID,
        userId: USER_ID,
        tableId: TABLE_A,
        selectionType: 'row',
        refKey: 'k',
        refValue: 'oops' as never,
        displayLabel: 'L',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds and persists (calls upsert with composite key)', async () => {
    prisma.__session.findUnique.mockResolvedValue(sessionOwned());
    prisma.__ref.upsert.mockResolvedValue({
      id: 'sel_1',
      sessionId: SESSION_ID,
      tableId: TABLE_A,
      viewId: null,
      selectionType: 'row',
      refKey: 'k',
      refValue: { recordId: 'r1' },
      displayLabel: 'Row A',
      rowCount: null,
      createdBy: USER_ID,
      createdTime: new Date('2026-09-05T00:00:00Z'),
    });
    await svc.add({
      sessionId: SESSION_ID,
      userId: USER_ID,
      tableId: TABLE_A,
      selectionType: 'row',
      refKey: 'k',
      refValue: { recordId: 'r1' },
      displayLabel: 'Row A',
    });
    expect(prisma.__ref.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.__ref.upsert.mock.calls[0][0];
    expect(arg.where.sessionId_refKey).toEqual({ sessionId: SESSION_ID, refKey: 'k' });
    expect(arg.create.tableId).toBe(TABLE_A);
    expect(arg.create.selectionType).toBe('row');
  });

  it('clearTable scopes by tableId and counts deletes', async () => {
    prisma.__session.findUnique.mockResolvedValue(sessionOwned());
    prisma.__ref.deleteMany.mockResolvedValue({ count: 3 });
    const r = await svc.clearTable(SESSION_ID, TABLE_A, USER_ID);
    expect(r.deleted).toBe(3);
    expect(prisma.__ref.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, tableId: TABLE_A },
    });
  });

  it('remove verifies session ownership via ref → session', async () => {
    prisma.__ref.findUnique.mockResolvedValue({ sessionId: SESSION_ID, tableId: TABLE_A });
    prisma.__session.findUnique.mockResolvedValue(sessionOwned({ baseId: null }));
    prisma.__ref.delete.mockResolvedValue({});
    const r = await svc.remove('sel_1', USER_ID);
    expect(r.deleted).toBe(true);
    expect(prisma.__ref.delete).toHaveBeenCalledWith({ where: { id: 'sel_1' } });
  });

  it('renderPrompt groups by tableId and renders <selection> blocks', () => {
    const out = svc.renderPrompt([
      {
        id: 's1',
        sessionId: SESSION_ID,
        tableId: TABLE_A,
        viewId: null,
        selectionType: 'row',
        refKey: 'a',
        refValue: {},
        displayLabel: 'Order #1',
        rowCount: null,
        createdBy: USER_ID,
        createdTime: new Date(),
      },
      {
        id: 's2',
        sessionId: SESSION_ID,
        tableId: TABLE_A,
        viewId: null,
        selectionType: 'row',
        refKey: 'b',
        refValue: {},
        displayLabel: 'Order #2',
        rowCount: null,
        createdBy: USER_ID,
        createdTime: new Date(),
      },
      {
        id: 's3',
        sessionId: SESSION_ID,
        tableId: TABLE_B,
        viewId: null,
        selectionType: 'column',
        refKey: 'c',
        refValue: {},
        displayLabel: 'Status',
        rowCount: 1,
        createdBy: USER_ID,
        createdTime: new Date(),
      },
    ]);
    expect(out).toContain('<selection table=' + TABLE_A + '>');
    expect(out).toContain('<selection table=' + TABLE_B + '>');
    expect(out).toContain('(row) "Order #1"');
    expect(out).toContain('(column) "Status" [1 rows]');
  });
});
