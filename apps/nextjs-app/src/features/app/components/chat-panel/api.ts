/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-8 — Cuppy AI 对话前端 API helpers
 *
 * Thin axios wrappers for the `/api/cuppy/*` endpoints exposed by
 * `agent-orchestrator/cuppy.controller.ts`. Returned shapes mirror the
 * backend response payloads so call sites can stay in plain TS.
 */
import { axios } from '@teable/openapi';

export interface ICuppyModel {
  id: string;
  label: string;
  tier: 'lite' | 'standard' | 'pro';
}

export interface ICuppyMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  createdAt: string;
}

export interface ICuppyChatReply {
  conversationId: string;
  text: string;
  /** Populated when a real LLM provider was reached; absent for echo fallback. */
  model?: string;
  /** Set when the chat landed on BuiltInEchoLlm due to missing provider config. */
  fallback?: 'no-base' | 'no-provider' | 'timeout' | 'error';
}

export interface ICuppyConversation {
  id: string;
  baseId: string | null;
  userId: string;
  smartLevel: 'low' | 'medium' | 'high';
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export const cuppyApi = {
  listModels: async (): Promise<ICuppyModel[]> => {
    const r = await axios.get<{ models: ICuppyModel[] }>('/api/cuppy/models');
    return r.data.models ?? [];
  },

  chat: async (body: {
    baseId?: string;
    conversationId?: string;
    message: string;
  }): Promise<ICuppyChatReply> => {
    const r = await axios.post<ICuppyChatReply>('/api/cuppy/chat', body);
    return r.data;
  },


  /**
   * R-AI-11 — Server-Sent Events chat. Calls `/api/cuppy/chat/stream` and
   * yields each token as `{delta, done, value, conversationId}`. Falls back
   * gracefully on network errors by emitting a final error delta.
   */
  chatStream: async function* (body: {
    baseId?: string;
    conversationId?: string;
    message: string;
  }): AsyncGenerator<{ delta: string; done: boolean; value?: string; conversationId?: string; error?: string }> {
    const res = await fetch('/api/cuppy/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const message = `stream failed: HTTP ${res.status}`;
      yield { delta: '', done: true, error: message };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by blank lines; each event starts with
        // `data: <json>`.
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6));
            yield {
              delta: payload.delta ?? '',
              done: Boolean(payload.done),
              value: payload.value,
              conversationId: payload.conversationId,
              error: payload.error,
            };
            if (payload.done) return;
          } catch {
            // ignore malformed event
          }
        }
      }
    } catch (err) {
      yield { delta: '', done: true, error: err instanceof Error ? err.message : 'stream failed' };
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }
  },
  getConversation: async (id: string): Promise<ICuppyConversation> => {
    const r = await axios.get<ICuppyConversation>(`/api/cuppy/conversations/${id}`);
    return r.data;
  },

  listMessages: async (id: string): Promise<ICuppyMessage[]> => {
    const r = await axios.get<{ messages: ICuppyMessage[] }>(
      `/api/cuppy/conversations/${id}/messages`
    );
    return r.data.messages ?? [];
  },

  deleteConversation: async (id: string): Promise<{ ok: boolean }> => {
    const r = await axios.delete<{ ok: boolean }>(`/api/cuppy/conversations/${id}`);
    return r.data;
  },

  pickModel: async (
    id: string,
    model: string
  ): Promise<{ ok: boolean; model: string }> => {
    const r = await axios.post<{ ok: boolean; model: string }>(
      `/api/cuppy/conversations/${id}/model`,
      { model }
    );
    return r.data;
  },

  getSmartLevel: async (id: string): Promise<{ smartLevel: 'low' | 'medium' | 'high' }> => {
    const r = await axios.get<{ smartLevel: 'low' | 'medium' | 'high' }>(
      `/api/cuppy/conversations/${id}/smart-level`
    );
    return r.data;
  },
};
