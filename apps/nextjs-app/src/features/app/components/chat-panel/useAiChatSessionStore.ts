/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-1: AI Chat session id store.
 *
 * The CuppyAdapter creates an ai_session lazily on the first turn
 * (see Runtime.tsx `createSession`). The ChatPanel needs the id
 * immediately so that SelectionChips can render its persisted refs
 * — including before the user has typed anything.
 *
 * To bridge that gap, this store holds the "currently active ai
 * session id" keyed by baseId. The adapter calls `setActive()` after
 * the first session create, and `reset()` when the panel closes or
 * the user switches base.
 *
 * Keyed by baseId so two open tabs in different bases don't collide.
 */
import { create } from 'zustand';

interface IAiChatSessionState {
  /** Map: baseId → aiSessionId */
  byBaseId: Record<string, string>;
  get: (baseId: string | undefined) => string | undefined;
  set: (baseId: string, sessionId: string) => void;
  reset: (baseId: string) => void;
  clear: () => void;
}

export const useAiChatSessionStore = create<IAiChatSessionState>()((set, getState) => ({
  byBaseId: {},
  get: (baseId) => (baseId ? getState().byBaseId[baseId] : undefined),
  set: (baseId, sessionId) =>
    set((state) => ({ byBaseId: { ...state.byBaseId, [baseId]: sessionId } })),
  reset: (baseId) =>
    set((state) => {
      const next = { ...state.byBaseId };
      delete next[baseId];
      return { byBaseId: next };
    }),
  clear: () => set({ byBaseId: {} }),
}));
