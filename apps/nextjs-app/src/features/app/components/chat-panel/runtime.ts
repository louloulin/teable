/* SPDX-License-Identifier: AGPL-3.0-or-later */
import {
  aiChatApi,
  cuppyApi,
  type IAiChatMessage,
  type ICuppyMessage,
} from './api';

export type ChatMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface IChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface IChatStreamEvent {
  delta: string;
  done: boolean;
  value?: string;
  conversationId?: string;
  error?: string;
}

export interface ChatRuntime {
  readonly kind: 'cuppy' | 'ai-chat';
  listMessages(): Promise<IChatMessage[]>;
  stream(message: string, context?: string): AsyncGenerator<IChatStreamEvent>;
  deleteConversation(): Promise<unknown>;
}

const normalizeCuppyMessage = (message: ICuppyMessage): IChatMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  createdAt: message.createdAt ?? new Date(message.ts ?? 0).toISOString(),
});

const normalizeAiMessage = (message: IAiChatMessage): IChatMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  createdAt: message.createdTime,
});

export const createCuppyRuntime = (input: {
  baseId?: string;
  conversationId?: string;
}): ChatRuntime => ({
  kind: 'cuppy',
  listMessages: async () => {
    if (!input.conversationId) return [];
    return (await cuppyApi.listMessages(input.conversationId)).map(normalizeCuppyMessage);
  },
  stream: (message, context) =>
    cuppyApi.chatStream({
      baseId: input.baseId,
      conversationId: input.conversationId,
      message,
      context,
    }),
  deleteConversation: async () =>
    input.conversationId ? cuppyApi.deleteConversation(input.conversationId) : { ok: true },
});

export const createAiChatRuntime = (sessionId?: string): ChatRuntime => ({
  kind: 'ai-chat',
  listMessages: async () => {
    if (!sessionId) return [];
    return (await aiChatApi.listMessages(sessionId)).map(normalizeAiMessage);
  },
  stream: (message, context) => {
    if (!sessionId) {
      return (async function* () {
        yield { delta: '', done: true, error: 'AI Chat session is not ready' };
      })();
    }
    return aiChatApi.chatStream({ sessionId, message, context });
  },
  deleteConversation: async () =>
    sessionId ? aiChatApi.deleteSession(sessionId) : { ok: true, id: '' },
});
