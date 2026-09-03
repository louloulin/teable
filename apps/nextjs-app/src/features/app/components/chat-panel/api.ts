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
  createdAt?: string;
  ts?: number;
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

export interface ICuppyConversationSummary {
  conversationId: string;
  baseId?: string;
  messageCount: number;
  updatedAt: number;
}

export interface ICuppyNodeRef {
  nodeId: string;
  kind: 'table' | 'view' | 'app' | 'automation' | 'folder';
  refId: string;
  label: string;
  addedAt: string;
}

export interface ICuppyArtifactRow {
  id: string;
  name: string;
  kind: 'chart' | 'report' | 'page' | 'card' | 'doc';
  versions: number;
  createdAt: string;
  shared: boolean;
}

export interface ICuppyFileRef {
  fileId: string;
  attachmentId?: string;
  token?: string;
  url?: string;
  name: string;
  mime: string;
  size: number;
  uploaded?: boolean;
  createdAt: string;
}

export const cuppyApi = {
  listConversations: async (): Promise<ICuppyConversationSummary[]> => {
    const r = await axios.get<{ conversations: ICuppyConversationSummary[] }>(
      '/api/cuppy/conversations'
    );
    return r.data.conversations ?? [];
  },

  listModels: async (): Promise<ICuppyModel[]> => {
    const r = await axios.get<{ models: ICuppyModel[] }>('/api/cuppy/models');
    return r.data.models ?? [];
  },

  createConversation: async (baseId?: string): Promise<{ conversationId: string }> => {
    const r = await axios.post<{ conversationId: string }>('/api/cuppy/conversations', {
      ...(baseId ? { baseId } : {}),
    });
    return r.data;
  },

  chat: async (body: {
    baseId?: string;
    conversationId?: string;
    message: string;
    context?: string;
  }): Promise<ICuppyChatReply> => {
    const r = await axios.post<ICuppyChatReply>('/api/cuppy/chat', body);
    return r.data;
  },

  /**
   * R-AI-11 — Server-Sent Events chat. Calls `/api/cuppy/chat/stream` and
   * yields each token as `{delta, done, value, conversationId}`. Falls back
   * gracefully on network errors by emitting a final error delta.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  chatStream: async function* (body: {
    baseId?: string;
    conversationId?: string;
    message: string;
    context?: string;
    attachmentIds?: string[];
  }): AsyncGenerator<{
    delta: string;
    done: boolean;
    value?: string;
    conversationId?: string;
    error?: string;
  }> {
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
              error:
                typeof payload.error === 'string'
                  ? payload.error
                  : payload.error
                    ? payload.message ?? 'stream failed'
                    : undefined,
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
    const r = await axios.get<{
      messages: Array<Omit<ICuppyMessage, 'createdAt'> & { createdAt?: string; ts?: number }>;
    }>(
      `/api/cuppy/conversations/${id}/messages`
    );
    return (r.data.messages ?? []).map((message) => ({
      ...message,
      createdAt: message.createdAt ?? new Date(message.ts ?? 0).toISOString(),
    }));
  },

  deleteConversation: async (id: string): Promise<{ ok: boolean }> => {
    const r = await axios.delete<{ ok: boolean }>(`/api/cuppy/conversations/${id}`);
    return r.data;
  },

  pickModel: async (id: string, model: string): Promise<{ ok: boolean; model: string }> => {
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

  listWritePlans: async (id: string): Promise<IAiChatWritePlan[]> => {
    const r = await axios.get<IAiChatWritePlan[]>(`/api/cuppy/conversations/${id}/write-plans`);
    return r.data;
  },

  confirmWritePlan: async (conversationId: string, planId: string): Promise<IAiChatWritePlan> => {
    const r = await axios.post<IAiChatWritePlan>(
      `/api/cuppy/conversations/${conversationId}/write-plans/${planId}/confirm`
    );
    return r.data;
  },

  listNodes: async (id: string): Promise<ICuppyNodeRef[]> => {
    const r = await axios.get<{ nodes: ICuppyNodeRef[] }>(`/api/cuppy/conversations/${id}/nodes`);
    return r.data.nodes ?? [];
  },

  listArtifacts: async (id: string): Promise<ICuppyArtifactRow[]> => {
    const r = await axios.get<{ artifacts: ICuppyArtifactRow[] }>(
      `/api/cuppy/conversations/${id}/artifacts`
    );
    return r.data.artifacts ?? [];
  },

  listFiles: async (id: string): Promise<ICuppyFileRef[]> => {
    const r = await axios.get<{ files: ICuppyFileRef[] }>(`/api/cuppy/conversations/${id}/files`);
    return r.data.files ?? [];
  },

  addFileMetadata: async (
    id: string,
    file: Pick<ICuppyFileRef, 'name' | 'mime' | 'size'>
  ): Promise<ICuppyFileRef> => {
    const r = await axios.post<ICuppyFileRef>(`/api/cuppy/conversations/${id}/files`, file);
    return r.data;
  },

  uploadFile: async (id: string, file: File): Promise<ICuppyFileRef> => {
    const body = new FormData();
    body.append('file', file);
    const r = await axios.post<ICuppyFileRef>(
      `/api/cuppy/conversations/${id}/files/upload`,
      body,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return r.data;
  },

  removeFile: async (conversationId: string, fileId: string): Promise<{ deleted: boolean }> => {
    const r = await axios.delete<{ deleted: boolean }>(
      `/api/cuppy/conversations/${conversationId}/files/${fileId}`
    );
    return r.data;
  },
};

export interface IAiChatSession {
  id: string;
  baseId: string | null;
  tableId: string | null;
  viewId: string | null;
  title: string | null;
  model: string;
  createdBy: string;
  createdTime: string;
  updatedTime: string;
}

export interface IAiChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdTime: string;
}

export interface IAiChatWritePlan {
  id: string;
  sessionId: string;
  baseId: string;
  tableId: string;
  operation: 'record_create' | 'record_update';
  summary: string;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'expired' | 'rejected';
  expiresAt: string;
  confirmedTime: string | null;
  executedTime: string | null;
  result: unknown;
  errorMessage: string | null;
  createdTime: string;
}

export interface IAiChatNodeRef {
  id: string;
  sessionId: string;
  kind: 'table' | 'view' | 'app' | 'automation' | 'folder';
  refId: string;
  label: string;
  createdBy: string;
  createdTime: string;
}

export const aiChatApi = {
  listSessions: async (baseId: string, take = 20): Promise<IAiChatSession[]> => {
    const r = await axios.get<IAiChatSession[]>('/api/chat/sessions', {
      params: { baseId, take },
    });
    return r.data;
  },

  createSession: async (baseId?: string): Promise<IAiChatSession> => {
    const r = await axios.post<IAiChatSession>('/api/chat/sessions', { baseId });
    return r.data;
  },
  /**
   * R-AI-CHAT-ATTACH — POST /api/chat/sessions/:id/turn with attachmentIds.
   * Used by the assistant-ui based ChatPanel runtime (`CuppyAdapter`).
   */
  chatTurn: async (input: {
    sessionId: string;
    message: string;
    context?: string;
    attachmentIds?: string[];
  }): Promise<{
    assistantMessageId: string;
    assistantMessage: IAiChatMessage;
  }> => {
    const r = await axios.post<{ assistantMessageId: string; assistantMessage: IAiChatMessage }>(
      `/api/chat/sessions/${input.sessionId}/turn`,
      {
        userMessage: input.message,
        context: input.context,
        attachmentIds: input.attachmentIds,
      }
    );
    return r.data;
  },


  listMessages: async (sessionId: string): Promise<IAiChatMessage[]> => {
    const r = await axios.get<IAiChatMessage[]>(`/api/chat/sessions/${sessionId}/messages`);
    return r.data;
  },

  listNodes: async (sessionId: string): Promise<IAiChatNodeRef[]> => {
    const r = await axios.get<IAiChatNodeRef[]>(`/api/chat/sessions/${sessionId}/nodes`);
    return r.data;
  },

  addNode: async (
    sessionId: string,
    input: Pick<IAiChatNodeRef, 'kind' | 'refId'>
  ): Promise<IAiChatNodeRef> => {
    const r = await axios.post<IAiChatNodeRef>(`/api/chat/sessions/${sessionId}/nodes`, input);
    return r.data;
  },

  removeNode: async (sessionId: string, nodeId: string): Promise<{ deleted: boolean }> => {
    const r = await axios.delete<{ deleted: boolean }>(
      `/api/chat/sessions/${sessionId}/nodes/${nodeId}`
    );
    return r.data;
  },

  deleteSession: async (sessionId: string): Promise<{ ok: true; id: string }> => {
    const r = await axios.delete<{ ok: true; id: string }>(`/api/chat/sessions/${sessionId}`);
    return r.data;
  },

  listWritePlans: async (sessionId: string): Promise<IAiChatWritePlan[]> => {
    const r = await axios.get<IAiChatWritePlan[]>(`/api/chat/sessions/${sessionId}/write-plans`);
    return r.data;
  },

  confirmWritePlan: async (planId: string): Promise<IAiChatWritePlan> => {
    const r = await axios.post<IAiChatWritePlan>(`/api/chat/write-plans/${planId}/confirm`);
    return r.data;
  },

  // eslint-disable-next-line sonarjs/cognitive-complexity
  chatStream: async function* (input: {
    sessionId: string;
    message: string;
    context?: string;
    attachmentIds?: string[];
  }): AsyncGenerator<{
    delta: string;
    done: boolean;
    value?: string;
    conversationId?: string;
    error?: string;
  }> {
    const response = await fetch(`/api/chat/sessions/${input.sessionId}/turn/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userMessage: input.message,
        context: input.context,
        attachmentIds: input.attachmentIds,
      }),
    });
    if (!response.ok || !response.body) {
      yield { delta: '', done: true, error: `AI Chat stream failed: HTTP ${response.status}` };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary = -1;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = raw.split('\n').find((item) => item.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              delta?: string;
              done?: boolean;
              assistantContent?: string;
              error?: string;
            };
            yield {
              delta: payload.delta ?? '',
              done: Boolean(payload.done),
              value: payload.assistantContent,
              conversationId: input.sessionId,
              error: payload.error,
            };
            if (payload.done) return;
          } catch {
            // Ignore an incomplete or malformed SSE frame.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
