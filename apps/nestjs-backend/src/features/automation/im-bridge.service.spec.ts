import { IMBridgeService, __test } from './im-bridge.service';
import { vi } from 'vitest';

interface MockStore {
  organizationIntegration: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  organizationIntegration: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }) => ({ id: data.id })),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

const buildAutomation = () => ({
  finishRun: vi.fn(async () => undefined),
});

describe('IMBridgeService (Stage 15)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encrypts and decrypts tokens round-trip', () => {
    const original = 'xoxb-test-token-12345';
    const envelope = __test.encryptToken(original);
    expect(envelope).not.toContain(original);
    expect(__test.decryptToken(envelope)).toBe(original);
  });

  it('returns delivered=true and posts to slack chat.postMessage', async () => {
    const prisma = buildPrisma();
    prisma.organizationIntegration.findFirst.mockResolvedValueOnce({
      id: 'i1',
      encryptedToken: __test.encryptToken('xoxb-test'),
      externalRef: 'C123',
    });
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await svc.dispatch({
      runId: 'r1',
      provider: 'slack',
      config: { organizationId: 'org1', text: 'hello' },
    });
    expect(result.delivered).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      channel: 'C123',
      text: 'hello',
    });
    expect(automation.finishRun).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('uses externalRef as webhook URL for discord', async () => {
    const prisma = buildPrisma();
    prisma.organizationIntegration.findFirst.mockResolvedValueOnce({
      id: 'i1',
      encryptedToken: null,
      externalRef: 'https://discord.com/api/webhooks/123/abc',
    });
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await svc.dispatch({
      runId: 'r2',
      provider: 'discord',
      config: { organizationId: 'org1', text: 'ping' },
    });
    expect(result.delivered).toBe(true);
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://discord.com/api/webhooks/123/abc');
  });

  it('sends telegram via bot API with chat_id', async () => {
    const prisma = buildPrisma();
    prisma.organizationIntegration.findFirst.mockResolvedValueOnce({
      id: 'i1',
      encryptedToken: __test.encryptToken('123456:ABC'),
      externalRef: '987654321',
    });
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await svc.dispatch({
      runId: 'r3',
      provider: 'telegram',
      config: { organizationId: 'org1', text: 'hi' },
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.telegram.org/bot123456:ABC/sendMessage');
  });

  it('marks skipped when no integration exists', async () => {
    const prisma = buildPrisma();
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const result = await svc.dispatch({
      runId: 'r4',
      provider: 'slack',
      config: { organizationId: 'org_missing', text: 'x' },
    });
    expect(result.delivered).toBe(false);
    expect(automation.finishRun).toHaveBeenCalledWith(
      'r4',
      expect.objectContaining({ status: 'skipped' })
    );
  });

  it('marks failed when bot token missing', async () => {
    const prisma = buildPrisma();
    prisma.organizationIntegration.findFirst.mockResolvedValueOnce({
      id: 'i1',
      encryptedToken: null,
      externalRef: 'C1',
    });
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const result = await svc.dispatch({
      runId: 'r5',
      provider: 'slack',
      config: { organizationId: 'org1', text: 'x' },
    });
    expect(result.delivered).toBe(false);
    expect(automation.finishRun).toHaveBeenCalledWith(
      'r5',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringMatching(/missing bot token/),
      })
    );
  });

  it('marks failed with NOT_SUPPORTED for whatsapp', async () => {
    const prisma = buildPrisma();
    const automation = buildAutomation();
    const svc = new IMBridgeService(prisma as never, automation as never);
    const result = await svc.dispatch({
      runId: 'r6',
      provider: 'whatsapp' as never,
      config: { organizationId: 'org1', text: 'x' },
    });
    expect(result.delivered).toBe(false);
    expect(automation.finishRun).toHaveBeenCalledWith(
      'r6',
      expect.objectContaining({ status: 'failed', error: expect.stringMatching(/NOT_SUPPORTED/) })
    );
  });
});
