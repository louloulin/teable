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
