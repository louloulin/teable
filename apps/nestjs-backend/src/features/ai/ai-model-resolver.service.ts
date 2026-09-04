/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-MODEL: capability × provider model resolver.
 *
 * Centralizes "which model do I call for capability X with provider Y?"
 * so the four AI capability entry points (chat / field / automation /
 * app builder) don't hard-code model strings.
 *
 * Matrix shape:
 *   Capability ∈ { chat, field, automation, app_builder }
 *   Provider  ∈ { openai, anthropic, MiniMax }
 *   → ModelId (provider-native name)
 *
 * The resolver is intentionally pure: no env, no Prisma, no I/O. Each
 * capability decides which provider config to use; the resolver maps
 * the policy to a concrete model and base URL.
 */
import { Injectable } from '@nestjs/common';

export type AiCapability = 'chat' | 'field' | 'automation' | 'app_builder';

export type AiProviderId = 'openai' | 'anthropic' | 'MiniMax';

export interface IAiProviderConfig {
  /** Provider identifier — matches the OpenAI-compatible gateway flag. */
  provider: AiProviderId;
  /** Native model name the provider expects. */
  model: string;
  /** Base URL for the provider's API. */
  baseUrl: string;
  /** Whether the provider supports structured tool-calling. */
  supportsTools: boolean;
  /** Window size in tokens (used by chat prompt guard). */
  contextWindow: number;
  /** Whether the provider supports vision/image inputs. */
  supportsVision: boolean;
}

export interface IAiResolverInput {
  capability: AiCapability;
  provider: AiProviderId;
  /**
   * Optional override — if a caller has already chosen a different
   * model (e.g. from session-level intelligence state in R-CHAT-2),
   * we honor that string instead of the matrix default.
   */
  overrideModel?: string;
}

export interface IAiResolverResult {
  /** Concrete provider config to pass to the LLM adapter. */
  config: IAiProviderConfig;
  /** Provenance — where did this model come from? */
  source: 'matrix' | 'override' | 'fallback';
}

interface ICapabilityProviderDefaults {
  [capability: string]: Record<AiProviderId, string>;
}

const PROVIDER_BASE_URLS: Record<AiProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  MiniMax: 'https://api.MiniMax.com/v1',
};

const PROVIDER_CAPABILITIES: Record<AiProviderId, Pick<IAiProviderConfig, 'supportsTools' | 'supportsVision' | 'contextWindow'>> = {
  openai:        { supportsTools: true,  supportsVision: true,  contextWindow: 128_000 },
  anthropic:     { supportsTools: true,  supportsVision: true,  contextWindow: 200_000 },
  MiniMax:    { supportsTools: true,  supportsVision: false, contextWindow:  64_000 },
};

/**
 * 4 capability × 3 provider = 12 default model mappings.
 * Tuned for the Cloud §ai §模型选择 matrix — see V81 roadmap.
 */
const CAPABILITY_PROVIDER_DEFAULTS: ICapabilityProviderDefaults = {
  chat: {
    openai:    'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-latest',
    MiniMax: 'MiniMax-M3',
  },
  field: {
    openai:    'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    MiniMax: 'MiniMax-M3',
  },
  automation: {
    openai:    'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    MiniMax: 'MiniMax-M3',
  },
  app_builder: {
    openai:    'gpt-4o',
    anthropic: 'claude-3-5-sonnet-latest',
    MiniMax: 'MiniMax-M3',
  },
};

const SUPPORTED_CAPABILITIES: readonly AiCapability[] = ['chat', 'field', 'automation', 'app_builder'] as const;
const SUPPORTED_PROVIDERS: readonly AiProviderId[] = ['openai', 'anthropic', 'MiniMax'] as const;

@Injectable()
export class AiModelResolverService {
  isCapability(value: unknown): value is AiCapability {
    return typeof value === 'string' && (SUPPORTED_CAPABILITIES as readonly string[]).includes(value);
  }

  isProvider(value: unknown): value is AiProviderId {
    return typeof value === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
  }

  listCapabilities(): readonly AiCapability[] {
    return SUPPORTED_CAPABILITIES;
  }

  listProviders(): readonly AiProviderId[] {
    return SUPPORTED_PROVIDERS;
  }

  /** Returns the matrix entry for a given (capability, provider). */
  defaultModel(capability: AiCapability, provider: AiProviderId): string {
    const capDefaults = CAPABILITY_PROVIDER_DEFAULTS[capability];
    if (!capDefaults) {
      throw new Error(`Unknown capability: ${capability}`);
    }
    const model = capDefaults[provider];
    if (!model) {
      throw new Error(`No default model for capability=${capability} provider=${provider}`);
    }
    return model;
  }

  /** Full provider config plus a provenance flag. */
  resolve(input: IAiResolverInput): IAiResolverResult {
    if (!this.isCapability(input.capability)) {
      throw new Error(`Unsupported capability: ${input.capability}`);
    }
    if (!this.isProvider(input.provider)) {
      throw new Error(`Unsupported provider: ${input.provider}`);
    }

    // Override path — caller already picked a model (e.g. R-CHAT-2
    // session-level intelligence state). Return a minimal provider
    // config carrying the override name and the provider's defaults.
    if (input.overrideModel && input.overrideModel.length > 0) {
      const caps = PROVIDER_CAPABILITIES[input.provider];
      return {
        source: 'override',
        config: {
          provider: input.provider,
          model: input.overrideModel,
          baseUrl: PROVIDER_BASE_URLS[input.provider],
          contextWindow: caps.contextWindow,
          supportsTools: caps.supportsTools,
          supportsVision: caps.supportsVision,
        },
      };
    }

    const model = this.defaultModel(input.capability, input.provider);
    const caps = PROVIDER_CAPABILITIES[input.provider];
    return {
      source: 'matrix',
      config: {
        provider: input.provider,
        model,
        baseUrl: PROVIDER_BASE_URLS[input.provider],
        contextWindow: caps.contextWindow,
        supportsTools: caps.supportsTools,
        supportsVision: caps.supportsVision,
      },
    };
  }

  /**
   * Compose the legacy `<provider>@<model>@<suffix>` string used
   * by `meta.setting.ai_config.chatModel.*`. Lets callers stick with
   * the existing persistence shape.
   */
  formatLegacyModelString(input: IAiResolverInput, suffix = 'teable'): string {
    const r = this.resolve(input);
    return `${r.config.provider}@${r.config.model}@${suffix}`;
  }
}

export const AI_MODEL_RESOLVER_MATRIX = CAPABILITY_PROVIDER_DEFAULTS;
