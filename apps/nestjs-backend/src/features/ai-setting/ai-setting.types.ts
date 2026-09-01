/**
 * AI Admin Setting — domain types (Round-AI-3).
 *
 * Backed by `meta.setting` (name='ai_config') so no schema migration.
 * The persisted shape is JSON; this file pins the TypeScript shape.
 *
 * License: AGPL-3.0
 */

export interface IAiCreditPolicy {
  /** Daily token cap per user (0 = unlimited). */
  perUserDailyCap: number;
  /** Daily token cap per org (0 = unlimited). */
  perOrgDailyCap: number;
  /** Whether to refund credits on 4xx/5xx errors. */
  refundOnFailure: boolean;
}

export interface IAiSetting {
  enabled: boolean;
  defaultModel: string;
  /** Smart level: low / medium / high. */
  defaultSmartLevel: 'low' | 'medium' | 'high';
  creditPolicy: IAiCreditPolicy;
  /** Allow custom models registered via /api/custom-ai-model. */
  allowCustomModels: boolean;
  /** Stream responses to the UI (else buffered). */
  streamingEnabled: boolean;
  /**
   * R-AI-7: Instance-level Admin AI Gateway. When set, all bases that
   * have not overridden their own LLM provider route through this
   * gateway key. null = gateway disabled.
   */
  aiGatewayApiKey: string | null;
  aiGatewayBaseUrl: string | null;
  updatedAt: string;
}

export const DEFAULT_AI_SETTING: IAiSetting = {
  enabled: true,
  defaultModel: 'gpt-4o-mini',
  defaultSmartLevel: 'medium',
  creditPolicy: {
    perUserDailyCap: 100_000,
    perOrgDailyCap: 1_000_000,
    refundOnFailure: true,
  },
  allowCustomModels: true,
  streamingEnabled: true,
  aiGatewayApiKey: null,
  aiGatewayBaseUrl: null,
  updatedAt: new Date(0).toISOString(),
};
