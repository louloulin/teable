/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Cuppy -> assistant-ui 0.10 ChatModelAdapter.
 *
 * The adapter consumes assistant-ui ThreadMessage values and yields
 * ChatModelRunResult updates. The existing backend remains authoritative:
 * the Cuppy stream endpoint is used for general chat and the authenticated
 * AI Chat stream endpoint is used for a base-scoped session.
 */
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
  ThreadAssistantMessagePart,
} from '@assistant-ui/react';
import { cuppyApi, aiChatApi, type ICuppyFileRef } from '../api';
import { useAiChatSessionStore } from '../useAiChatSessionStore';

export interface ICuppyRuntimeInput {
  baseId?: string;
  conversationId?: string;
  selectionContext?: string;
}

export interface CuppyRuntimeState {
  cuppyConversationId?: string;
  aiSessionId?: string;
  attachmentIds: string[];
}

const getText = (message: ThreadMessage): string =>
  message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

const getAttachmentIds = (message: ThreadMessage): string[] =>
  (message.attachments ?? [])
    .map((attachment) => {
      const metadata = attachment as unknown as {
        id: string;
        metadata?: { custom?: { fileId?: string; attachmentId?: string } };
      };
      return (
        metadata.metadata?.custom?.attachmentId ??
        metadata.metadata?.custom?.fileId ??
        metadata.id
      );
    })
    .filter((value): value is string => Boolean(value));

const toTextPart = (text: string): ThreadAssistantMessagePart => ({
  type: 'text',
  text,
});

const toRunResult = (text: string, done: boolean): ChatModelRunResult => ({
  content: text ? [toTextPart(text)] : [],
  status: done ? { type: 'complete', reason: 'stop' } : { type: 'running' },
});

export class CuppyAdapter implements ChatModelAdapter {
  readonly state: CuppyRuntimeState = { attachmentIds: [] };

  constructor(private readonly input: ICuppyRuntimeInput) {
    if (input.baseId) this.state.aiSessionId = input.conversationId;
    else this.state.cuppyConversationId = input.conversationId;
  }

  async ensureCuppyConversation(): Promise<string> {
    if (!this.state.cuppyConversationId) {
      const created = await cuppyApi.createConversation(this.input.baseId);
      this.state.cuppyConversationId = created.conversationId;
    }
    return this.state.cuppyConversationId;
  }

  async uploadAttachment(file: File): Promise<string> {
    const conversationId = await this.ensureCuppyConversation();
    const uploaded = await cuppyApi.uploadFile(conversationId, file);
    return fileRefToAttachmentId(uploaded);
  }

  async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
    if (options.abortSignal.aborted) return;
    const lastUser = [...options.messages].reverse().find((message) => message.role === 'user');
    if (!lastUser || lastUser.role !== 'user') {
      yield toRunResult('', true);
      return;
    }

    const text = getText(lastUser);
    const attachmentIds = getAttachmentIds(lastUser);
    this.state.attachmentIds = attachmentIds;

    if (!this.input.baseId && attachmentIds.length === 0) {
      let final = '';
      for await (const chunk of cuppyApi.chatStream({
        message: text,
        conversationId: this.state.cuppyConversationId,
        context: this.input.selectionContext,
      })) {
        if (options.abortSignal.aborted) return;
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.conversationId) this.state.cuppyConversationId = chunk.conversationId;
        if (chunk.delta) {
          final += chunk.delta;
          yield toRunResult(final, false);
        }
        if (chunk.done) {
          final = chunk.value ?? final;
          yield toRunResult(final, true);
          return;
        }
      }
      yield toRunResult(final, true);
      return;
    }

    if (!this.state.aiSessionId) {
      const session = await aiChatApi.createSession(this.input.baseId);
      this.state.aiSessionId = session.id;
      if (this.input.baseId) {
        useAiChatSessionStore.getState().set(this.input.baseId, session.id);
      }
    }

    let final = '';
    for await (const chunk of aiChatApi.chatStream({
      sessionId: this.state.aiSessionId,
      message: text,
      context: this.input.selectionContext,
      attachmentIds,
    })) {
      if (options.abortSignal.aborted) return;
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.delta) {
        final += chunk.delta;
        yield toRunResult(final, false);
      }
      if (chunk.done) {
        final = chunk.value ?? final;
        yield toRunResult(final, true);
        return;
      }
    }
    yield toRunResult(final, true);
  }
}

export const buildCuppyAdapter = (input: ICuppyRuntimeInput): CuppyAdapter =>
  new CuppyAdapter(input);

export const fileRefToAttachmentId = (
  file: Pick<ICuppyFileRef, 'fileId' | 'attachmentId' | 'token'>
): string => file.token ?? file.attachmentId ?? file.fileId;
