/**
 * Custom AI Model — domain types.
 *
 * Each "custom model" is a per-org AI provider endpoint the admin configures
 * (provider type, base URL, model name, optional API key ref, isolation).
 * Backed by the existing `meta.byok_llm_key` table — we tag rows whose
 * provider starts with `custom-` as "custom model" entries, so no schema
 * migration is needed.
 *
 * License: AGPL-3.0
 */

export type CustomAiProvider =
  | 'custom-openai'      // OAI-compatible (OpenAI, Together, Groq, etc.)
  | 'custom-anthropic'   // Anthropic messages API
  | 'custom-azure'       // Azure OpenAI deployments
  | 'custom-ollama'      // Self-hosted Ollama
  | 'custom-bedrock';    // AWS Bedrock (future)

export type CustomAiIsolation = 'shared' | 'per_base' | 'per_user';

export const SUPPORTED_CUSTOM_PROVIDERS: CustomAiProvider[] = [
  'custom-openai',
  'custom-anthropic',
  'custom-azure',
  'custom-ollama',
  'custom-bedrock',
];

export interface ICustomAiModel {
  id: string;
  orgId: string;
  provider: CustomAiProvider;
  alias: string;
  baseUrl?: string;
  modelName: string;
  /** API key id (in byok_llm_key) — never the plaintext itself. */
  apiKeyId?: string;
  status: 'active' | 'disabled' | 'pending_verification';
  isolation: CustomAiIsolation;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateCustomAiModelInput {
  orgId: string;
  provider: CustomAiProvider;
  alias: string;
  baseUrl?: string;
  modelName: string;
  apiKey?: string;        // plaintext; hashed + stored in byok_llm_key
  isolation?: CustomAiIsolation;
}

export interface IUpdateCustomAiModelInput {
  alias?: string;
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  isolation?: CustomAiIsolation;
  status?: ICustomAiModel['status'];
}

export interface ICustomAiModelTestResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  testedAt: string;
}

export interface ICustomAiModelUsage {
  orgId: string;
  totalRequests: number;
  totalTokens: number;
  byModel: Array<{ modelId: string; alias: string; requests: number; tokens: number }>;
}
