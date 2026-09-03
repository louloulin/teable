/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CuppyAdapter, fileRefToAttachmentId } from './Runtime';
import { aiChatApi, cuppyApi } from '../api';

vi.mock('../api', () => ({
  cuppyApi: {
    createConversation: vi.fn(async () => ({ conversationId: 'cuppy-1' })),
    uploadFile: vi.fn(async () => ({ fileId: 'file-1', attachmentId: 'att-1', token: 'tok-1' })),
    chatStream: vi.fn(async function* () {
      yield { delta: 'ok', done: false };
      yield { delta: '', done: true, value: 'ok', conversationId: 'cuppy-1' };
    }),
  },
  aiChatApi: {
    createSession: vi.fn(async () => ({ id: 'session-1' })),
    chatStream: vi.fn(async function* () {
      yield { delta: 'attached', done: false };
      yield { delta: '', done: true, value: 'attached' };
    }),
  },
}));

const userMessage = (attachments: Array<{ id: string }> = []) => ({
  role: 'user' as const,
  id: 'u1',
  createdAt: new Date(),
  content: [{ type: 'text' as const, text: 'summarize' }],
  attachments,
  metadata: { custom: {} },
}) as never;

describe('CuppyAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefers the backend attachment token for prompt extraction', () => {
    expect(fileRefToAttachmentId({ fileId: 'file-1', attachmentId: 'att-1', token: 'tok-1' })).toBe('tok-1');
    expect(fileRefToAttachmentId({ fileId: 'file-1', attachmentId: 'att-1' })).toBe('att-1');
    expect(fileRefToAttachmentId({ fileId: 'file-1' })).toBe('file-1');
  });

  it('uses the Cuppy stream for a text-only general message', async () => {
    const adapter = new CuppyAdapter({});
    const updates = [];
    for await (const update of adapter.run({ messages: [userMessage()], runConfig: {}, abortSignal: new AbortController().signal, context: {}, config: {}, unstable_getMessage: () => userMessage() })) updates.push(update);
    expect(cuppyApi.chatStream).toHaveBeenCalledWith({ message: 'summarize', conversationId: undefined, context: undefined });
    expect(aiChatApi.createSession).not.toHaveBeenCalled();
    expect(updates.at(-1)?.status).toEqual({ type: 'complete', reason: 'stop' });
  });

  it('uses AI Chat stream and forwards attachment id', async () => {
    const adapter = new CuppyAdapter({});
    const updates = [];
    for await (const update of adapter.run({ messages: [userMessage([{ id: 'att-1' }])], runConfig: {}, abortSignal: new AbortController().signal, context: {}, config: {}, unstable_getMessage: () => userMessage() })) updates.push(update);
    expect(aiChatApi.createSession).toHaveBeenCalledWith(undefined);
    expect(aiChatApi.chatStream).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: 'summarize',
      context: undefined,
      attachmentIds: ['att-1'],
    });
    expect(cuppyApi.chatStream).not.toHaveBeenCalled();
  });

  it('creates a Cuppy conversation before uploading an attachment', async () => {
    const adapter = new CuppyAdapter({});
    const id = await adapter.uploadAttachment(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    expect(cuppyApi.createConversation).toHaveBeenCalledWith(undefined);
    expect(cuppyApi.uploadFile).toHaveBeenCalledWith('cuppy-1', expect.any(File));
    expect(id).toBe('tok-1');
  });

  it('does not send a request when assistant-ui aborts before the run', async () => {
    const adapter = new CuppyAdapter({});
    const controller = new AbortController();
    controller.abort();
    const updates = [];
    for await (const update of adapter.run({
      messages: [userMessage()],
      runConfig: {},
      abortSignal: controller.signal,
      context: {},
      config: {},
      unstable_getMessage: () => userMessage(),
    })) updates.push(update);
    expect(updates).toHaveLength(0);
    expect(cuppyApi.chatStream).not.toHaveBeenCalled();
  });
});
