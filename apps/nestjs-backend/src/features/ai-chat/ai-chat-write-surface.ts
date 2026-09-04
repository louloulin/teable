/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-WRITE-1: AI Chat write surface — extended operation taxonomy.
 *
 * The legacy `AiChatWritePlanService` only handled record-level
 * `record_create` / `record_update`. Cloud §ai-chat §writes wants AI to be
 * able to plan + confirm + apply changes across 5 categories:
 *
 *   1. table    — create / update / delete a table
 *   2. field    — create / update / delete a field on a table
 *   3. view     — create / update / delete a view on a table
 *   4. record   — create / update / delete records in a table
 *   5. automation — create / update / delete automations on a table
 *
 * Each plan is a list of typed steps. The `confirm` path is responsible
 * for running each step through the existing service layer so we don't
 * bypass authorization or business rules.
 */
export type AiChatWriteCategory = 'table' | 'field' | 'view' | 'record' | 'automation';

export type AiChatWriteStepOp =
  | 'create'
  | 'update'
  | 'delete';

export interface IAiChatWriteStep {
  /** Stable id used to address this step in preview / diff / confirmation UIs. */
  id: string;
  /** Category drives which sub-service confirms this step. */
  category: AiChatWriteCategory;
  /** Operation kind within the category. */
  op: AiChatWriteStepOp;
  /** Human-readable summary shown in the WritePlanPreview UI. */
  summary: string;
  /** Operation payload — shape validated by the per-category confirm path. */
  payload: Record<string, unknown>;
  /** Optional resource id required for update / delete. */
  resourceId?: string;
}

export interface IAiChatWritePlanDocument {
  version: 1;
  steps: IAiChatWriteStep[];
  /** Plan-wide metadata — diff / rollback keys, etc. */
  meta?: Record<string, unknown>;
}

/** Stable step id factory — same plan produces same ids. */
export function stepId(category: AiChatWriteCategory, op: AiChatWriteStepOp, n: number): string {
  return `${category}-${op}-${n.toString(36)}`;
}

const CATEGORIES: readonly AiChatWriteCategory[] = [
  'table',
  'field',
  'view',
  'record',
  'automation',
] as const;

export const AI_CHAT_WRITE_CATEGORIES = CATEGORIES;

export function isAiChatWriteCategory(value: unknown): value is AiChatWriteCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isWriteStepOp(value: unknown): value is AiChatWriteStepOp {
  return value === 'create' || value === 'update' || value === 'delete';
}
