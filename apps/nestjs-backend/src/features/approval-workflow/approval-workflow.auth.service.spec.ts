/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { ApprovalWorkflowAuthService } from './approval-workflow.auth.service';

interface IMockWf {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockReq {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockDec {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  approvalWorkflow: IMockWf;
  approvalRequest: IMockReq;
  approvalDecision: IMockDec;
}

const buildPrisma = (): IMockPrisma => ({
  approvalWorkflow: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  },
  approvalRequest: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: new Date() })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  approvalDecision: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new ApprovalWorkflowAuthService(prisma as never);
  return { svc, prisma };
};

const wfRow = (over: Record<string, unknown> = {}) => ({
  id: 'wf1',
  baseId: 'b',
  tableId: 't',
  name: 'sample',
  strategy: 'all',
  approverIdsJson: JSON.stringify(['alice', 'bob']),
  threshold: null,
  expiresInHours: null,
  createdTime: new Date(),
  updatedTime: new Date(),
  ...over,
});

describe('ApprovalWorkflowAuthService (Stage 46)', () => {
  it('createWorkflow persists a row', async () => {
    const { svc, prisma } = buildSvc();
    const w = await svc.createWorkflow({
      baseId: 'b',
      tableId: 't',
      name: 'sample',
      strategy: 'all',
      approverIds: ['alice', 'bob'],
    });
    expect(w.strategy).toBe('all');
    expect(w.approverIds).toEqual(['alice', 'bob']);
    expect(prisma.approvalWorkflow.create).toHaveBeenCalledTimes(1);
  });

  it('createWorkflow rejects invalid input', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createWorkflow({
        baseId: 'b',
        tableId: 't',
        name: '',
        strategy: 'all',
        approverIds: ['a'],
      })
    ).rejects.toThrow();
  });

  it('listWorkflows filters by base', async () => {
    const { svc, prisma } = buildSvc();
    await svc.listWorkflows('b1');
    expect(prisma.approvalWorkflow.findMany).toHaveBeenCalledWith({
      where: { baseId: 'b1' },
    });
  });

  it('getWorkflow throws on missing', async () => {
    const { svc } = buildSvc();
    await expect(svc.getWorkflow('ghost')).rejects.toThrow(/not found/);
  });

  it('deleteWorkflow removes the row', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalWorkflow.findUnique.mockResolvedValueOnce(wfRow() as never);
    await svc.deleteWorkflow('wf1');
    expect(prisma.approvalWorkflow.delete).toHaveBeenCalledWith({ where: { id: 'wf1' } });
  });

  it('createRequest copies approverIds from workflow', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalWorkflow.findUnique.mockResolvedValueOnce(
      wfRow({ approverIdsJson: JSON.stringify(['alice', 'bob']) }) as never
    );
    const r = await svc.createRequest({
      baseId: 'b',
      tableId: 't',
      recordId: 'r1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      payload: { amount: 100 },
    });
    expect(r.approverIds).toEqual(['alice', 'bob']);
    expect(prisma.approvalRequest.create).toHaveBeenCalled();
  });

  it('createRequest throws when workflow missing', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createRequest({
        baseId: 'b',
        tableId: 't',
        recordId: 'r1',
        workflowId: 'ghost',
        requesterUserId: 'u',
        payload: {},
      })
    ).rejects.toThrow(/not found/);
  });

  it('castDecision records vote and updates status', async () => {
    const { svc, prisma } = buildSvc();
    const reqRow = {
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice', 'bob']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    };
    prisma.approvalRequest.findUnique.mockResolvedValue(reqRow as never);
    prisma.approvalWorkflow.findUnique.mockResolvedValue(wfRow({ strategy: 'any-one' }) as never);
    prisma.approvalDecision.findMany.mockResolvedValueOnce([] as never);
    await svc.castDecision({ requestId: 'r1', approverUserId: 'alice', decision: 'approve' });
    expect(prisma.approvalDecision.create).toHaveBeenCalledTimes(1);
  });

  it('castDecision rejects non-approver', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    } as never);
    await expect(
      svc.castDecision({ requestId: 'r1', approverUserId: 'mallory', decision: 'approve' })
    ).rejects.toThrow(/not an approver/);
  });

  it('castDecision rejects double-vote', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    } as never);
    prisma.approvalDecision.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        requestId: 'r1',
        approverUserId: 'alice',
        decision: 'approve',
        createdTime: new Date(),
      },
    ] as never);
    await expect(
      svc.castDecision({ requestId: 'r1', approverUserId: 'alice', decision: 'approve' })
    ).rejects.toThrow(/already voted/);
  });

  it('castDecision rejects non-pending request', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'approved',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: new Date(),
    } as never);
    await expect(
      svc.castDecision({ requestId: 'r1', approverUserId: 'alice', decision: 'approve' })
    ).rejects.toThrow(/not pending/);
  });

  it('cancelRequest by requester flips status', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    } as never);
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'cancelled',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: new Date(),
    } as never);
    const out = await svc.cancelRequest('r1', 'u');
    expect(out.status).toBe('cancelled');
    expect(prisma.approvalRequest.update).toHaveBeenCalled();
  });

  it('cancelRequest rejects non-requester', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    } as never);
    await expect(svc.cancelRequest('r1', 'mallory')).rejects.toThrow(/requester/);
  });

  it('listRequestsForUser filters by approver OR requester', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        baseId: 'b',
        tableId: 't',
        recordId: 'rec1',
        workflowId: 'wf1',
        requesterUserId: 'u',
        status: 'pending',
        payloadJson: '{}',
        approverIdsJson: JSON.stringify(['alice']),
        expiresAt: null,
        createdTime: new Date(),
        decidedAt: null,
      },
    ] as never);
    const out = await svc.listRequestsForUser('alice', true);
    expect(out).toHaveLength(1);
  });

  it('progress returns counts', async () => {
    const { svc, prisma } = buildSvc();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      baseId: 'b',
      tableId: 't',
      recordId: 'rec1',
      workflowId: 'wf1',
      requesterUserId: 'u',
      status: 'pending',
      payloadJson: '{}',
      approverIdsJson: JSON.stringify(['alice', 'bob']),
      expiresAt: null,
      createdTime: new Date(),
      decidedAt: null,
    } as never);
    prisma.approvalWorkflow.findUnique.mockResolvedValueOnce(wfRow({ strategy: 'all' }) as never);
    prisma.approvalDecision.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        requestId: 'r1',
        approverUserId: 'alice',
        decision: 'approve',
        createdTime: new Date(),
      },
    ] as never);
    const p = await svc.progress('r1');
    expect(p.approvalsCount).toBe(1);
    expect(p.remainingRequired).toBe(1);
  });
});
