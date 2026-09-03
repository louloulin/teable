import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';

import { IpAllowlistMiddleware } from './ip-allowlist.middleware';

interface MockAllowlist {
  evaluate: ReturnType<typeof vi.fn>;
}
interface MockAuditEvent {
  create: ReturnType<typeof vi.fn>;
}
interface MockPrisma {
  auditEvent: MockAuditEvent;
}

const buildPrisma = (): MockPrisma => ({
  auditEvent: {
    create: vi.fn(async ({ data }) => data),
  },
});

interface ReqOverrides {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  user?: { organizationId?: string | null } | null;
  query?: Record<string, unknown>;
  body?: Record<string, unknown> | null;
}

const buildReq = (overrides: ReqOverrides = {}): Request => {
  const req = {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/anything',
    originalUrl: overrides.originalUrl ?? overrides.url ?? '/api/anything',
    headers: overrides.headers ?? {},
    socket: overrides.socket ?? { remoteAddress: '127.0.0.1' },
    user: overrides.user ?? null,
    query: overrides.query ?? {},
    body: overrides.body ?? null,
  };
  return req as unknown as Request;
};

const buildRes = (): Response => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res as unknown as Response;
};

describe('IpAllowlistMiddleware (Stage 26 — R47)', () => {
  let prisma: MockPrisma;
  let allowlist: MockAllowlist;
  let mw: IpAllowlistMiddleware;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = buildPrisma();
    allowlist = { evaluate: vi.fn() };
    mw = new IpAllowlistMiddleware(allowlist as never, prisma as never);
    next = vi.fn();
  });

  it('bypasses healthz unconditionally', async () => {
    const req = buildReq({ url: '/healthz', originalUrl: '/healthz' });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('bypasses when there is no organizationId in the request', async () => {
    const req = buildReq();
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('lets the request through when there are no allowlist entries', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.5',
      decision: { allowed: true, blocked: false, audited: false, matchedEntryId: null },
    });
    const req = buildReq({
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks with 403 + audit when an entry matches in block mode', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '198.51.100.42',
      decision: { allowed: false, blocked: true, audited: false, matchedEntryId: 'ipa_1' },
    });
    const req = buildReq({
      method: 'POST',
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '198.51.100.42', 'x-request-id': 'req-1' },
      socket: { remoteAddress: '198.51.100.42' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IP_ALLOWLIST_BLOCKED', requestId: 'req-1' })
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditEvent.create.mock.calls[0]?.[0]?.data;
    expect(auditArg).toEqual(
      expect.objectContaining({
        organizationId: 'org_a',
        action: 'ip_allowlist.block',
        ipAddress: '198.51.100.42',
        requestId: 'req-1',
      })
    );
    expect(auditArg.detail).toEqual(
      expect.objectContaining({
        source: 'ip-allowlist-middleware',
        ip: '198.51.100.42',
        matchedEntryId: 'ipa_1',
        method: 'POST',
        requestId: 'req-1',
      })
    );
  });

  it('lets the request through but writes an audit row on audit-mode match', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.7',
      decision: { allowed: false, blocked: false, audited: true, matchedEntryId: 'ipa_2' },
    });
    const req = buildReq({
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditEvent.create.mock.calls[0]?.[0]?.data;
    expect(auditArg.action).toBe('ip_allowlist.audit');
  });

  it('resolves organizationId from the query string when no session is present', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.8',
      decision: { allowed: true, blocked: false, audited: false, matchedEntryId: null },
    });
    const req = buildReq({
      query: { organizationId: 'org_q' },
      headers: { 'x-forwarded-for': '203.0.113.8' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_q' })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('prefers session organizationId over query/body', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.9',
      decision: { allowed: true, blocked: false, audited: false, matchedEntryId: null },
    });
    const req = buildReq({
      user: { organizationId: 'org_session' },
      query: { organizationId: 'org_q' },
      body: { organizationId: 'org_body' },
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_session' })
    );
  });

  it('falls back to body organizationId when no session or query', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.10',
      decision: { allowed: true, blocked: false, audited: false, matchedEntryId: null },
    });
    const req = buildReq({
      method: 'POST',
      body: { organizationId: 'org_body' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_body' })
    );
  });

  it('does not crash when audit write fails — still returns 403', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '203.0.113.11',
      decision: { allowed: false, blocked: true, audited: false, matchedEntryId: 'ipa_3' },
    });
    prisma.auditEvent.create.mockRejectedValue(new Error('db down'));
    const req = buildReq({
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '203.0.113.11' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IP_ALLOWLIST_BLOCKED' })
    );
  });

  it('fails open when evaluate() throws — never break the request path', async () => {
    allowlist.evaluate.mockRejectedValue(new Error('boom'));
    const req = buildReq({
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '203.0.113.12' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('bypasses the IP allowlist CRUD admin route', async () => {
    const req = buildReq({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      originalUrl: '/api/admin/ip-allowlist',
      user: { organizationId: 'org_a' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    expect(allowlist.evaluate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when none is provided', async () => {
    allowlist.evaluate.mockResolvedValue({
      ip: '198.51.100.99',
      decision: { allowed: false, blocked: true, audited: false, matchedEntryId: 'ipa_x' },
    });
    const req = buildReq({
      user: { organizationId: 'org_a' },
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });
    const res = buildRes();
    await mw.use(req, res, next as unknown as NextFunction);
    const auditArg = prisma.auditEvent.create.mock.calls[0]?.[0]?.data;
    expect(typeof auditArg?.requestId).toBe('string');
    expect(auditArg.requestId.length).toBeGreaterThan(0);
  });
});
