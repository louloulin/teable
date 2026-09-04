import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { AiChatAttachmentExtractor } from './ai-chat-attachment-extractor.service';
import { AiChatAttachmentParserService } from './ai-chat-attachment-parser.service';
import { AiChatAuthService } from './ai-chat.auth.service';

/**
 * V76 P0-1 — capture-the-prompt regression test for AI Chat attachment
 * end-to-end injection.
 *
 * The wiring (V75):
 *   controller chatTurn → svc.chatTurn(input) → builds `prompt` →
 *   `ai.generateText(baseId, { prompt, task })` → returns text.
 *
 * Without a real LLM provider we can't read the actual completion, but
 * we CAN inspect the `prompt` that would have been sent. This test
 * directly drives `chatTurn` with a captured `ai.generateText` mock and
 * asserts the attachment text block reaches the prompt.
 */
describe('AiChatAuthService.chatTurn — attachment prompt injection (V76 P0-1)', () => {
  function buildPrisma(filePath: string) {
    return {
      aiChatMessage: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async (i: unknown) => i),
      },
      attachments: {
        findUnique: vi.fn(async ({ where }: { where: { token: string } }) => ({
          token: where.token,
          name: 'doc.txt',
          mimetype: 'text/plain',
          size: 22,
          path: filePath,
        })),
      },
      aiChatSession: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async (i: unknown) => i),
      },
    };
  }

  function stubPrivateHelpers(svc: AiChatAuthService) {
    (svc as unknown as { addMessage: (i: unknown) => Promise<{ id: string }> }).addMessage = vi.fn(
      async () => ({ id: 'm' })
    );
    (svc as unknown as { resolveContextPrefix: () => Promise<string> }).resolveContextPrefix = vi.fn(
      async () => ''
    );
    (svc as unknown as { resolveSkill: () => Promise<null> }).resolveSkill = vi.fn(async () => null);
    (svc as unknown as { resolveMemory: () => Promise<string> }).resolveMemory = vi.fn(async () => '');
    (svc as unknown as { resolvePreferences: () => Promise<string> }).resolvePreferences = vi.fn(
      async () => ''
    );
    (svc as unknown as { resolveNodeRefs: () => Promise<string> }).resolveNodeRefs = vi.fn(
      async () => ''
    );
    (svc as unknown as { resolveTools: () => Promise<unknown> }).resolveTools = vi.fn(async () => []);
    (svc as unknown as { resolveSmartLevel: () => Promise<unknown> }).resolveSmartLevel = vi.fn(
      async () => 'medium'
    );
    (svc as unknown as { findOwnedSession: (id: string, uid: string) => Promise<unknown> }).findOwnedSession =
      vi.fn(async (id: string) => ({
        id,
        baseId: 'b1',
        tableId: null,
        createdBy: 'u1',
        smartLevel: 'medium',
        model: null,
      }));
  }

  it('inlines text attachment into the prompt sent to the LLM', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cuppy-e2e-attach-'));
    const filePath = path.join(tmpDir, 'doc.txt');
    await fsp.writeFile(filePath, 'CONFIDENTIAL_BODY_42', 'utf8');

    const fakePrisma = buildPrisma(filePath);
    const generatedTexts: Array<{ baseId: string; prompt: string; task: string }> = [];
    const fakeAi = {
      generateText: vi.fn(async (baseId: string, args: { prompt: string; task: string }) => {
        generatedTexts.push({ baseId, prompt: args.prompt, task: args.task });
        return 'MOCK_REPLY';
      }),
    };

    const extractor = new AiChatAttachmentExtractor(fakePrisma as never);
    const svc = new AiChatAuthService(
      fakePrisma as never,
      fakeAi as never,
      undefined, // context
      undefined, // skill
      undefined, // memory
      undefined, // preference
      undefined, // tools
      undefined, // artifact
      undefined, // smartLevel
      undefined, // queue
      undefined, // permission
      undefined, // nodeRef
      extractor, // attachmentExtractor
      undefined  // llm
    );
    // Belt-and-suspenders: SWC + parameter-property + decorator can fail
    // to auto-assign in some chains, so we re-assign explicitly. This
    // is the field actually read by chatTurn's wiring.
    (svc as unknown as { attachmentExtractor: AiChatAttachmentExtractor | undefined }).attachmentExtractor = extractor;
    stubPrivateHelpers(svc);

    await (svc as unknown as {
      chatTurn: (i: {
        sessionId: string;
        userId: string;
        userMessage: string;
        attachmentIds: string[];
      }) => Promise<unknown>;
    }).chatTurn({
      sessionId: 's1',
      userId: 'u1',
      userMessage: 'summarize the doc',
      attachmentIds: ['att-doc'],
    });

    expect(generatedTexts).toHaveLength(1);
    const { prompt, baseId, task } = generatedTexts[0];
    expect(prompt).toContain('<attachments>');
    expect(prompt).toContain('CONFIDENTIAL_BODY_42');
    expect(prompt).toContain('file="doc.txt"');
    expect(prompt).toContain('</attachments>');
    expect(baseId).toBe('b1');
    expect(task).toBe('coding');

    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('omits the attachments block when no attachmentIds are provided', async () => {
    const fakePrisma = {
      aiChatMessage: { findMany: vi.fn(async () => []) },
      aiChatSession: { findFirst: vi.fn(async () => null), update: vi.fn(async () => null) },
    };
    const fakeAi = {
      generateText: vi.fn(async () => 'OK'),
    };
    const svc = new AiChatAuthService(
      fakePrisma as never,
      fakeAi as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );
    stubPrivateHelpers(svc);

    await (svc as unknown as {
      chatTurn: (i: { sessionId: string; userId: string; userMessage: string }) => Promise<unknown>;
    }).chatTurn({ sessionId: 's1', userId: 'u1', userMessage: 'hi' });

    expect(fakeAi.generateText).toHaveBeenCalledTimes(1);
    const prompt = (fakeAi.generateText as ReturnType<typeof vi.fn>).mock.calls[0][1]
      .prompt as string;
    expect(prompt).not.toContain('<attachments>');
  });
});
