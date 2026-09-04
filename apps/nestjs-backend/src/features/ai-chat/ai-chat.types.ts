/**
 * AI Chat (Cloud §ai/ai-chat) — Stage 35 types.
 *
 * Minimal chat session + message model. Sessions carry optional
 * baseId/tableId/viewId context; messages are user/assistant/system
 * turns with token usage tracking.
 */

export type AiChatRole = 'user' | 'assistant' | 'system';

export interface IAiChatSession {
  id: string;
  baseId: string | null;
  tableId: string | null;
  viewId: string | null;
  title: string | null;
  model: string | null;
  smartLevel: string | null;
  tokenBudget: number | null;
  allowedTools: unknown;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface IAiChatMessage {
  id: string;
  sessionId: string;
  role: AiChatRole;
  content: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  createdTime: Date;
}

export interface ICreateChatSessionInput {
  baseId?: string;
  tableId?: string;
  viewId?: string;
  title?: string;
  model: string | null;
  smartLevel: string | null;
  tokenBudget: number | null;
  allowedTools: unknown;
  createdBy: string;
}

export interface IAddChatMessageInput {
  sessionId: string;
  role: AiChatRole;
  content: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
}

export type AiChatSmartLevel = 'low' | 'medium' | 'high';

export interface IChatTurnInput {
  sessionId: string;
  /** Authenticated caller. Required for HTTP callers; omitted for trusted internal drains/tests. */
  userId?: string;
  userMessage: string;
  /** Optional table/view context to prepend to the prompt. */
  context?: string;
  /**
   * Stage 54 — reasoning intensity for this turn. Overrides the global
   * `defaultSmartLevel` from `meta.setting.ai_config` for the current
   * prompt only. Common values: 'low' (concise/direct),
   * 'medium' (step-by-step), 'high' (deep reasoning + alternatives).
   */
  smartLevel?: AiChatSmartLevel;
  /**
   * Stage 75 — attachment tokens uploaded via cuppy upload. The backend
   * resolves them to text content (or a placeholder for binary types) and
   * injects the block into the chat prompt before the assistant reply.
   */
  attachmentIds?: string[];
}

export interface IChatTurnResult {
  userMessageId: string;
  assistantMessageId: string;
  assistantContent: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  /** Skill name when the user message started with `@<skill>`. */
  skillName?: string;
}
