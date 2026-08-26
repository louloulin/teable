/**
 * BYOK LLM isolation — Stage 66.
 *
 * Per-organization LLM API key isolation. Each org can register
 * keys for one or more LLM providers (openai, anthropic, google,
 * mistral, bedrock, custom) and route requests to its own key.
 * Keys are stored as opaque ciphertext envelopes (the master KMS
 * is Stage 35); this module owns the per-org usage accounting,
 * fallback policy, and provider health.
 */

export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'bedrock'
  | 'azure'
  | 'custom';

export type LlmKeyStatus = 'active' | 'rate-limited' | 'exhausted' | 'disabled' | 'invalid';

export type LlmIsolationMode = 'exclusive' | 'shared' | 'passthrough';

export interface ILlmProviderKey {
  id: string;
  orgId: string;
  provider: LlmProvider;
  /** Stable alias shown in the admin panel; never the secret. */
  alias: string;
  status: LlmKeyStatus;
  /** Opaque ciphertext envelope (decrypt with Stage 35 master). */
  ciphertextRef: string;
  /** Last 4 chars of the plaintext key for identification in the UI. */
  fingerprint: string;
  /** ISO date when the key was first verified (round-trip with provider). */
  verifiedAt: string | null;
  /** ISO date when the key was last used successfully. */
  lastUsedAt: string | null;
  /** Provider-reported tokens per minute cap (0 = unknown). */
  providerTpmCap: number;
  /** Daily cap the org has imposed (0 = unlimited). */
  orgDailyCap: number;
  isolation: LlmIsolationMode;
  createdAt: string;
  updatedAt: string;
}

export interface ILlmUsageRow {
  orgId: string;
  keyId: string;
  provider: LlmProvider;
  /** Local date (YYYY-MM-DD) for daily accounting. */
  day: string;
  /** Total tokens billed by the provider (input + output). */
  tokens: number;
  /** Total USD cost the org has incurred (post markup). */
  costCents: number;
  /** Successful invocations. */
  requests: number;
  /** Failed invocations (4xx/5xx). */
  errors: number;
}

export interface ILlmCallAttempt {
  orgId: string;
  keyId: string;
  provider: LlmProvider;
  tokens: number;
  costCents: number;
  succeeded: boolean;
  atIso: string;
}

export interface ILlmHealthSnapshot {
  provider: LlmProvider;
  keyId: string;
  status: LlmKeyStatus;
  /** Rolling 1-minute success rate (0..1). */
  successRate1m: number;
  /** Average latency in ms over the rolling 1-minute window. */
  p50LatencyMs: number;
  /** Provider-reported remaining quota (USD cents) when known. */
  quotaRemainingCents: number | null;
  observedAt: string;
}

export interface ILlmRoutingDecision {
  keyId: string | null;
  provider: LlmProvider | null;
  /** Why a particular key was picked (or why none was). */
  reason: string;
  /** True when the caller should retry with the next candidate. */
  retry: boolean;
}

export interface ILlmRoutingOptions {
  /** Preferred providers in order; first usable wins. */
  preferred?: ReadonlyArray<LlmProvider>;
  /** Minimum required remaining daily cap (tokens); 0 = any. */
  minRemainingTokens?: number;
  /** When true, allow fallback to a shared key when no org key fits. */
  allowSharedFallback?: boolean;
  /** Preferred model family (e.g. "gpt-4o"). */
  modelHint?: string;
}

export const DEFAULT_MIN_REMAINING_TOKENS = 1000;
export const MAX_LLM_KEYS_PER_ORG = 32;
export const DEFAULT_HEALTH_WINDOW_MS = 60_000;
export const DEFAULT_HEALTH_MIN_REQUESTS = 5;

/** Provider labels used by admin UI. */
export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  bedrock: 'AWS Bedrock',
  azure: 'Azure OpenAI',
  custom: '自定义',
};
