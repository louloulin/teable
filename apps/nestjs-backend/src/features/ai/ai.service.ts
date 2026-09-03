/* eslint-disable sonarjs/no-duplicate-string */
import type { OpenAIProvider } from '@ai-sdk/openai';
import { Injectable, Logger } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import {
  IntegrationType,
  LLMProviderType,
  SettingKey,
  Task,
  normalizeGatewayPricing,
  supportsImageInputForImageGeneration,
} from '@teable/openapi';
import type {
  IAIConfig,
  IAiGenerateRo,
  IChatModelAbility,
  IGatewayApiModel,
  IGetAIConfig,
  GatewayModelTag,
  LLMProvider,
} from '@teable/openapi';
import type { ImageModel, LanguageModel } from 'ai';
import { createGateway, generateImage, generateText, streamText } from 'ai';
import axios from 'axios';
import type { Response } from 'express';
import { BaseConfig, IBaseConfig } from '../../configs/base.config';
import { CustomHttpException } from '../../custom.exception';
import { PerformanceCacheService } from '../../performance-cache';
import { InstanceSkillService } from '../instance-skills/instance-skill.service';
import { SettingService } from '../setting/setting.service';
import { AiGatewayModelsService } from './ai-gateway-models.service';
import { getAdaptedProviderOptions, getTaskModelKey, modelProviders } from './util';

// Fixed name for instance-level provider config in modelKey.
// Admin AI setting providers are normalized to @teable, including both AI Gateway
// and custom providers. Distinguish them by provider type, not by this suffix.
// Space BYOK providers keep their custom provider name.
export const INSTANCE_PROVIDER_NAME = 'teable';

export type ILanguageModelV2 = Exclude<LanguageModel, string>;

export interface IResolvedModelMapping {
  requestedModelKey: string;
  effectiveModelKey: string;
  mapped: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly settingService: SettingService,
    private readonly prismaService: PrismaService,
    @BaseConfig() private readonly baseConfig: IBaseConfig,
    private readonly performanceCacheService: PerformanceCacheService,
    private readonly aiGatewayModelsService: AiGatewayModelsService,
    private readonly instanceSkillService: InstanceSkillService
  ) {}

  public parseModelKey(modelKey: string) {
    const [type, model, name] = modelKey.split('@');
    return { type, model, name };
  }

  /**
   * Check if modelKey is an AI Gateway model
   * Format: aiGateway@<modelId>@teable
   */
  public isGatewayModel(modelKey: string): boolean {
    const { type } = this.parseModelKey(modelKey);
    return type?.toLowerCase() === LLMProviderType.AI_GATEWAY.toLowerCase();
  }

  private providerHasModel(provider: LLMProvider, model: string): boolean {
    return provider.models
      .split(',')
      .map((item) => item.trim())
      .includes(model);
  }

  private modelConfigHasRates(provider: LLMProvider, model: string): boolean {
    const config = provider.modelConfigs?.[model];
    return Boolean(
      config?.pricing?.input ||
        config?.pricing?.output ||
        config?.pricing?.image ||
        config?.inputRate != null ||
        config?.outputRate != null ||
        config?.imageRate != null
    );
  }

  public isInstanceAIModelByConfig(modelKey: string, llmProviders: LLMProvider[] = []): boolean {
    const { type, model, name } = this.parseModelKey(modelKey);
    if (!type || !model || !name) return false;
    if (this.isGatewayModel(modelKey)) return true;

    const provider = llmProviders.find(
      (p) =>
        p.type.toLowerCase() === type.toLowerCase() &&
        p.name.toLowerCase() === name.toLowerCase() &&
        this.providerHasModel(p, model)
    );
    if (provider) return Boolean(provider.isInstance);

    return this.checkInstanceAIModel(modelKey);
  }

  /**
   * Build a gateway modelKey from a gateway model ID
   * @param modelId Gateway model ID (e.g., "anthropic/claude-sonnet-4")
   */
  public buildGatewayModelKey(modelId: string): string {
    return `${LLMProviderType.AI_GATEWAY}@${modelId}@${INSTANCE_PROVIDER_NAME}`;
  }

  private validateMappedTargetModel(modelKey: string, llmProviders: LLMProvider[]): void {
    const { type, model, name } = this.parseModelKey(modelKey);
    if (
      !type ||
      !model ||
      !name ||
      type.toLowerCase() === LLMProviderType.AI_GATEWAY.toLowerCase()
    ) {
      throw new CustomHttpException(
        'AI model mapping target must be an instance custom provider model',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.providerConfigurationNotSet',
          },
        }
      );
    }

    const provider = llmProviders.find(
      (p) =>
        p.type.toLowerCase() === type.toLowerCase() &&
        p.name.toLowerCase() === name.toLowerCase() &&
        this.providerHasModel(p, model)
    );
    if (!provider?.isInstance) {
      throw new CustomHttpException(
        'AI model mapping target provider is not configured as an instance provider',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.providerConfigurationNotSet',
          },
        }
      );
    }
    if (!this.modelConfigHasRates(provider, model)) {
      throw new CustomHttpException(
        'AI model mapping target pricing is not configured',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.providerConfigurationNotSet',
          },
        }
      );
    }
  }

  public resolveModelMapping(
    modelKey: string,
    llmProviders: LLMProvider[] = [],
    aiConfig?: IAIConfig | null
  ): IResolvedModelMapping {
    if (!this.baseConfig.isCloud || !this.isGatewayModel(modelKey)) {
      return { requestedModelKey: modelKey, effectiveModelKey: modelKey, mapped: false };
    }

    const mapping = aiConfig?.modelMappings?.find(
      (item) => item.enabled !== false && item.sourceModelKey === modelKey
    );
    if (!mapping) {
      return { requestedModelKey: modelKey, effectiveModelKey: modelKey, mapped: false };
    }

    if (mapping.targetModelKey === modelKey) {
      throw new CustomHttpException(
        'AI model mapping target cannot be the same as source',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.providerConfigurationNotSet',
          },
        }
      );
    }
    this.validateMappedTargetModel(mapping.targetModelKey, llmProviders);
    return { requestedModelKey: modelKey, effectiveModelKey: mapping.targetModelKey, mapped: true };
  }

  public async resolveEffectiveModelKey(
    modelKey: string,
    llmProviders: LLMProvider[] = []
  ): Promise<IResolvedModelMapping> {
    if (!this.baseConfig.isCloud || !this.isGatewayModel(modelKey)) {
      return { requestedModelKey: modelKey, effectiveModelKey: modelKey, mapped: false };
    }

    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    return this.resolveModelMapping(modelKey, llmProviders, aiConfig);
  }

  /**
   * Parse owner/provider from gateway model ID
   * @param modelId Gateway model ID (e.g., "anthropic/claude-sonnet-4" -> "anthropic")
   */
  private parseOwnerFromModelId(modelId: string): string | undefined {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0].toLowerCase() : undefined;
  }

  // modelKey-> type@model@name
  async getModelConfig(modelKey: string, llmProviders: LLMProvider[] = []) {
    const { effectiveModelKey } = await this.resolveEffectiveModelKey(modelKey, llmProviders);
    const { type, model, name } = this.parseModelKey(effectiveModelKey);

    // Special handling for AI Gateway models
    if (this.isGatewayModel(effectiveModelKey)) {
      const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);

      if (!aiConfig?.aiGatewayApiKey) {
        throw new CustomHttpException(
          'AI Gateway API key is not configured',
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.ai.gatewayApiKeyNotSet',
            },
          }
        );
      }

      return {
        type: LLMProviderType.AI_GATEWAY,
        model, // This is the gateway modelId (e.g., "anthropic/claude-sonnet-4")
        baseUrl: aiConfig.aiGatewayBaseUrl || undefined,
        apiKey: aiConfig.aiGatewayApiKey,
      };
    }

    // Standard provider lookup
    const providerConfig = llmProviders.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() && p.type.toLowerCase() === type.toLowerCase()
    );

    if (!providerConfig) {
      throw new CustomHttpException(
        'AI provider configuration is not set',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.providerConfigurationNotSet',
          },
        }
      );
    }

    const { baseUrl, apiKey } = providerConfig;

    return {
      type,
      model,
      baseUrl,
      apiKey,
    };
  }

  async getModelInstance(
    modelKey: string,
    llmProviders: LLMProvider[],
    isImageGeneration: true
  ): Promise<ReturnType<OpenAIProvider['image']>>;
  async getModelInstance(
    modelKey: string,
    llmProviders?: LLMProvider[],
    isImageGeneration?: false
  ): Promise<ILanguageModelV2>;
  async getModelInstance(
    modelKey: string,
    llmProviders: LLMProvider[] = [],
    isImageGeneration = false
  ): Promise<ILanguageModelV2 | ImageModel> {
    const { type, model, baseUrl, apiKey } = await this.getModelConfig(modelKey, llmProviders);

    // For AI Gateway models, use official gateway provider from AI SDK
    // See: https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
    // baseUrl is optional - SDK uses its default if not provided
    if (type === LLMProviderType.AI_GATEWAY) {
      if (!apiKey) {
        throw new CustomHttpException(
          'AI configuration is not set',
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.ai.configurationNotSet',
            },
          }
        );
      }
      if (model === 'MiniMax-M3' || model === 'MiniMax-Text-01') {
        const openaiCompatibleProvider = modelProviders[LLMProviderType.OPENAI_COMPATIBLE];
        if (!openaiCompatibleProvider || !baseUrl) {
          throw new CustomHttpException(
            'AI gateway configuration is incomplete',
            HttpErrorCode.VALIDATION_ERROR,
            {
              localization: {
                i18nKey: 'httpErrors.ai.configurationNotSet',
              },
            }
          );
        }
        const modelProvider = openaiCompatibleProvider({
          name: model,
          baseURL: baseUrl,
          apiKey,
          includeUsage: true,
        } as never);
        return modelProvider(model);
      }
      const gatewayProvider = createGateway({
        apiKey,
        ...(baseUrl && { baseURL: baseUrl }),
      });
      // Return appropriate model type based on isImageGeneration flag
      // Image models (e.g., bfl/flux-pro) use gatewayProvider.imageModel()
      // Language models (including Gemini image via generateText) use gatewayProvider()
      return isImageGeneration ? gatewayProvider.imageModel(model) : gatewayProvider(model);
    }

    // For standard providers, both baseUrl and apiKey are required
    if (!baseUrl || !apiKey) {
      throw new CustomHttpException('AI configuration is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }

    const effectiveType = type;
    const effectiveModel = model;

    const provider = Object.entries(modelProviders).find(
      ([key]) => effectiveType.toLowerCase() === key.toLowerCase()
    )?.[1];

    if (!provider) {
      throw new CustomHttpException(
        `Unsupported AI provider: ${effectiveType}`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.ai.unsupportedProvider',
            context: {
              type: effectiveType,
            },
          },
        }
      );
    }

    const providerOptions = getAdaptedProviderOptions(effectiveType as LLMProviderType, {
      name: effectiveModel,
      baseURL: baseUrl,
      apiKey,
    });
    const modelProvider = provider(providerOptions as never) as OpenAIProvider;

    return isImageGeneration
      ? (modelProvider.image(effectiveModel) as ReturnType<OpenAIProvider['image']>)
      : modelProvider(effectiveModel);
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async getAIConfig(baseId: string) {
    // Chat/global callers may pass an empty baseId; in that case we only
    // consult the instance-level admin AI config (no space integration).
    const baseIdForLookup = baseId?.trim();
    const aiIntegration = baseIdForLookup
      ? await this.prismaService.integration.findFirst({
          where: {
            resourceId: (
              await this.prismaService.base.findUnique({
                where: { id: baseIdForLookup },
                select: { spaceId: true },
              })
            )?.spaceId,
            type: IntegrationType.AI,
            enable: true,
          },
        })
      : null;

    const aiIntegrationConfig = aiIntegration?.config ? JSON.parse(aiIntegration.config) : null;
    const { aiConfig } = await this.settingService.getSetting();

    const hasInstanceAIConfig =
      aiConfig &&
      (aiConfig.enable ||
        aiConfig.chatModel?.lg ||
        aiConfig.llmProviders?.length > 0 ||
        aiConfig.aiGatewayApiKey);
    if (!aiIntegrationConfig && !hasInstanceAIConfig) {
      throw new CustomHttpException('AI configuration is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }

    let config: IAIConfig;

    if (!aiIntegrationConfig) {
      const lg = aiConfig?.chatModel?.lg;
      const sm = aiConfig?.chatModel?.sm;
      const md = aiConfig?.chatModel?.md;
      const ability = aiConfig?.chatModel?.ability;

      config = {
        ...aiConfig,
        llmProviders: aiConfig?.llmProviders.map((provider) => ({
          ...provider,
          isInstance: true,
        })),
        chatModel: {
          sm: sm || lg,
          md: md || lg,
          lg: lg,
          ability,
        },
      } as IAIConfig;
    } else if (!aiConfig?.chatModel?.lg) {
      config = aiIntegrationConfig as IAIConfig;
    } else {
      const lg = aiConfig.chatModel.lg;
      const sm = aiConfig.chatModel.sm;
      const md = aiConfig.chatModel.md;
      const ability = aiConfig.chatModel.ability;
      config = {
        ...aiIntegrationConfig,
        // Include gateway models from admin config (space config doesn't have gateway models)
        gatewayModels: aiConfig.gatewayModels,
        llmProviders: [
          ...aiIntegrationConfig.llmProviders,
          ...aiConfig.llmProviders.map((provider) => ({
            ...provider,
            isInstance: true,
          })),
        ],
        chatModel: {
          sm: sm || lg,
          md: md || lg,
          lg: lg,
          ability,
        },
      } as IAIConfig;
    }

    // Fetch tags for the lg chat model and include in response
    const lgModelKey = config.chatModel?.lg;
    if (lgModelKey) {
      try {
        const tags = await this.getModelTags(lgModelKey, config.llmProviders);
        if (tags.length > 0) {
          // Add tags to chatModel response (IGetAIConfig extends IAIConfig with tags)
          return {
            ...config,
            chatModel: {
              ...config.chatModel,
              tags,
            },
          } as IGetAIConfig;
        }
      } catch (error) {
        this.logger.warn(`[getAIConfig] Failed to get tags for chat model ${lgModelKey}: ${error}`);
      }
    }

    return config as IGetAIConfig;
  }

  async getAIDisableAIActions(baseId: string) {
    const { spaceId } = await this.prismaService.base.findUniqueOrThrow({
      where: { id: baseId },
      select: { spaceId: true },
    });
    // get space ai setting
    const aiIntegration = await this.prismaService.integration.findUnique({
      where: { resourceId: spaceId, type: IntegrationType.AI },
    });

    const aiIntegrationConfig = aiIntegration?.config ? JSON.parse(aiIntegration.config) : null;
    const disableAIActionsFromSpaceIntegration =
      aiIntegrationConfig?.capabilities?.disableActions ?? [];

    // get instance ai setting
    const { aiConfig } = await this.settingService.getSetting();
    const disableAIActionsFromInstanceAiSetting = aiConfig?.capabilities?.disableActions ?? [];

    // merge both: instance-level disableActions should always be respected
    const merged = [
      ...disableAIActionsFromInstanceAiSetting,
      ...disableAIActionsFromSpaceIntegration,
    ];
    return {
      disableActions: [...new Set(merged)],
    };
  }

  async getSimplifiedAIConfig(baseId: string) {
    try {
      const config = await this.getAIConfig(baseId);
      const llmProviders = this.baseConfig.isCloud
        ? config.llmProviders.filter(({ isInstance }) => !isInstance)
        : config.llmProviders;
      return {
        enable: config.enable,
        llmProviders: llmProviders.map(({ type, name, models, isInstance, modelConfigs }) => ({
          type,
          name,
          models,
          isInstance,
          modelConfigs,
        })),
        embeddingModel: config.embeddingModel,
        translationModel: config.translationModel,
        chatModel: config.chatModel,
        capabilities: config.capabilities,
        gatewayModels: config.gatewayModels,
        attachmentTransferMode: config.attachmentTransferMode,
      };
    } catch {
      return null;
    }
  }

  private async getGenerationModelInstance(baseId: string, aiGenerateRo: IAiGenerateRo) {
    const { modelKey: _modelKey, task = Task.Coding } = aiGenerateRo;
    const config = await this.getAIConfig(baseId);
    const modelKey = _modelKey ?? getTaskModelKey(config, task);
    if (!modelKey) {
      throw new Error('Model key is not set');
    }
    return await this.getModelInstance(modelKey, config.llmProviders);
  }

  async generateStream(
    baseId: string,
    aiGenerateRo: IAiGenerateRo,
    response: Response
  ): Promise<void> {
    const prompt = await this.withInstanceSkills(aiGenerateRo.prompt);
    const modelInstance = await this.getGenerationModelInstance(baseId, aiGenerateRo);

    const result = streamText({
      model: modelInstance,
      prompt: prompt,
    });

    result.pipeTextStreamToResponse(response);
  }

  async *generateTextStream(
    baseId: string,
    aiGenerateRo: IAiGenerateRo,
    abortSignal?: AbortSignal,
    includeInstanceSkills = true
  ): AsyncGenerator<{ delta: string; done: boolean; value?: string }> {
    const modelInstance = await this.getGenerationModelInstance(baseId, aiGenerateRo);
    const prompt = includeInstanceSkills
      ? await this.withInstanceSkills(aiGenerateRo.prompt)
      : aiGenerateRo.prompt;
    const result = streamText({
      model: modelInstance,
      prompt,
      abortSignal,
    });
    let value = '';
    for await (const delta of result.textStream) {
      value += delta;
      yield { delta, done: false };
    }
    yield { delta: '', done: true, value };
  }

  async generateText(baseId: string, aiGenerateRo: IAiGenerateRo, includeInstanceSkills = true) {
    const modelInstance = await this.getGenerationModelInstance(baseId, aiGenerateRo);
    const prompt = includeInstanceSkills
      ? await this.withInstanceSkills(aiGenerateRo.prompt)
      : aiGenerateRo.prompt;

    // R-AI-JSON — JSON mode wiring. When jsonMode is set we forward
    // providerOptions so the gateway emits a structured response. We
    // also gently prepend an instruction to nudge free-form models.
    const wantsJson = aiGenerateRo.jsonMode === true;
    const effectivePrompt = wantsJson && !prompt.toLowerCase().includes('json')
      ? `${prompt}\n\nRespond with a single JSON object. Do not include markdown fences.`
      : prompt;

    const { text } = await generateText({
      model: modelInstance,
      prompt: effectivePrompt,
      providerOptions: wantsJson
        ? {
            minimax: { response_format: { type: 'json_object' } },
            openai: { response_format: { type: 'json_object' } },
          }
        : undefined,
    });
    return wantsJson ? this.extractJsonPayload(text) : text;
  }

  /**
   * R-AI-JSON — Strip `<think>...</think>` reasoning wrappers that
   * reasoning models (MiniMax-M3, DeepSeek-R1) prepend to their output,
   * then return the first JSON object / array found in the remainder.
   *
   * Falls back to the raw text when no JSON is detected so the caller
   * can still surface a useful error message.
   */
  private extractJsonPayload(text: string): string {
    let body = text;
    // 1. Strip every <think>...</think> block (case-insensitive, multiline).
    body = body.replace(/<think>[\s\S]*?<\/think>/gi, '');
    body = body.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    body = body.trim();

    // 2. Strip markdown fences (```json ... ```).
    const fenceMatch = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      body = fenceMatch[1].trim();
    }

    // 3. Extract the first balanced {... or [...] block.
    const start = body.search(/[{\[]/);
    if (start < 0) {
      return text; // no JSON found — return raw
    }
    const open = body[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === open) {
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0) {
          return body.slice(start, i + 1);
        }
      }
    }
    return text;
  }

  /**
   * Generate an image with the configured image-capable model.
   * Returns the generated file (uint8Array + mediaType) so callers can
   * persist it as an attachment.
   *
   * MiniMax models (MiniMax-M3 / MiniMax-Text-01) use the provider's
   * native `/image_generation` endpoint (image-01), while other models
   * go through the AI SDK `generateImage` path.
   */
  async generateImage(
    baseId: string,
    modelKey: string,
    prompt: string,
    options?: { size?: string; aspectRatio?: string; n?: number }
  ): Promise<{ images: Array<{ uint8Array: Uint8Array; mediaType: string }>; usage?: unknown }> {
    const config = await this.getAIConfig(baseId);
    const { type, model, baseUrl, apiKey } = await this.getModelConfig(modelKey, config.llmProviders);

    // MiniMax native image generation (image-01) via /image_generation
    if (
      type === LLMProviderType.AI_GATEWAY &&
      (model === 'MiniMax-M3' || model === 'MiniMax-Text-01')
    ) {
      return this.generateMiniMaxImage(baseUrl ?? '', apiKey ?? '', prompt, options);
    }

    const modelInstance = await this.getModelInstance(modelKey, config.llmProviders, true);
    // ai SDK v3 ImageModel vs v4 ImageModelV3 are structurally compatible
    // but TS can't reconcile the union — runtime call works.
    const result = await (generateImage as unknown as (
      args: {
        model: unknown;
        prompt: string;
        n?: number;
        size?: string;
        aspectRatio?: string;
      }
    ) => Promise<{ images: Array<{ uint8Array: Uint8Array; mediaType: string }>; usage?: unknown }>)({
      model: modelInstance,
      prompt,
      n: options?.n ?? 1,
      ...(options?.size ? { size: options.size } : {}),
      ...(options?.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
    });
    return {
      images: result.images.map((image) => ({
        uint8Array: image.uint8Array,
        mediaType: image.mediaType,
      })),
      usage: result.usage,
    };
  }

  private async generateMiniMaxImage(
    baseUrl: string | undefined,
    apiKey: string,
    prompt: string,
    options?: { size?: string; aspectRatio?: string; n?: number }
  ): Promise<{ images: Array<{ uint8Array: Uint8Array; mediaType: string }>; usage?: unknown }> {
    const endpoint = `${baseUrl ?? 'https://api.minimaxi.com/v1'}/image_generation`;
    const aspectRatio = options?.aspectRatio ?? '1:1';
    const response = await axios.post(
      endpoint,
      {
        model: 'image-01',
        prompt,
        n: options?.n ?? 1,
        aspect_ratio: aspectRatio,
        ...(options?.size ? { size: options.size } : {}),
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 60_000,
      }
    );
    const urls: string[] = response.data?.data?.image_urls ?? [];
    if (urls.length === 0) {
      throw new Error('MiniMax image generation returned no image URLs');
    }
    const images: Array<{ uint8Array: Uint8Array; mediaType: string }> = [];
    for (const url of urls) {
      const imageResponse = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      const buffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers['content-type'] ?? 'image/jpeg';
      images.push({ uint8Array: new Uint8Array(buffer), mediaType: contentType });
    }
    return { images };
  }

  private async withInstanceSkills(prompt: string): Promise<string> {
    const context = await this.instanceSkillService.enabledPromptContext();
    return context ? `${context}\n\nUser request:\n${prompt}` : prompt;
  }

  async getInstanceAIConfig() {
    if (!this.baseConfig.isCloud) return null;

    const { aiConfig } = await this.settingService.getSetting();

    if (!aiConfig?.chatModel?.lg) return null;

    return aiConfig;
  }

  findModelInProviders(modelKey: string, llmProviders: LLMProvider[]): boolean {
    const { type, model, name } = this.parseModelKey(modelKey);

    const providerConfig = llmProviders.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() &&
        p.type.toLowerCase() === type.toLowerCase() &&
        this.providerHasModel(p, model)
    );
    return !!providerConfig;
  }

  /**
   * Check if a model is an instance (platform-provided) model.
   * Instance-level admin AI setting models use the "@teable" provider name suffix.
   * This includes both AI Gateway and admin custom providers; use provider type
   * when code needs to distinguish the two.
   */
  checkInstanceAIModel(modelKey: string): boolean {
    return modelKey.endsWith(`@${INSTANCE_PROVIDER_NAME}`);
  }

  async getChatModelInstance(baseId: string) {
    const { chatModel, llmProviders } = await this.getAIConfig(baseId);
    if (!chatModel?.lg) {
      throw new CustomHttpException('AI chat model lg is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.chatModelLgNotSet',
        },
      });
    }

    // Check if lg model is a gateway model
    const isGateway = this.isGatewayModel(chatModel.lg);
    let isInstance = false;

    if (isGateway) {
      // Gateway models are instance-level (from admin config)
      isInstance = true;
    } else {
      // Standard provider lookup
      const { type, model, name } = this.parseModelKey(chatModel?.lg);
      const lgProvider = llmProviders.find(
        (p) =>
          p.name.toLowerCase() === name.toLowerCase() &&
          p.type.toLowerCase() === type.toLowerCase() &&
          p.models.includes(model)
      );
      if (!lgProvider) {
        throw new CustomHttpException(
          'AI chat model lg provider is not set',
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.ai.chatModelLgProviderNotSet',
            },
          }
        );
      }
      isInstance = !!lgProvider.isInstance;
    }

    if (!chatModel?.sm) {
      throw new CustomHttpException('AI chat model sm is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.chatModelSmNotSet',
        },
      });
    }
    if (!chatModel?.md) {
      throw new CustomHttpException('AI chat model md is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.chatModelMdNotSet',
        },
      });
    }

    return {
      sm: await this.getModelInstance(chatModel?.sm, llmProviders),
      md: await this.getModelInstance(chatModel?.md, llmProviders),
      lg: await this.getModelInstance(chatModel?.lg, llmProviders),
      ability: chatModel?.ability,
      isInstance,
      lgModelKey: chatModel.lg,
      mdModelKey: chatModel.md,
      smModelKey: chatModel.sm,
    };
  }

  /**
   * Get gateway model configuration by modelId
   * First checks local gatewayModels config, then falls back to API
   */
  async getGatewayModelConfig(modelId: string) {
    // First check local config (admin-configured models)
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    const gatewayModels = aiConfig?.gatewayModels ?? [];
    const localModel = gatewayModels.find((m) => m.id === modelId);
    if (localModel) {
      return localModel;
    }

    // If not found locally, fetch from API (for custom-selected models)
    const apiModel = await this.getGatewayApiModel(modelId);
    if (apiModel) {
      // Convert API model format to local model format
      return {
        ...apiModel,
        label: apiModel.name || apiModel.id,
        enabled: true,
      };
    }

    return undefined;
  }

  /**
   * Get model capability tags for any model (AI Gateway or custom provider)
   * This is the unified method to determine model capabilities like vision, file-input, etc.
   *
   * Priority:
   * 1. AI Gateway: from getGatewayModelConfig().tags
   * 2. Custom Provider: from modelConfigs[model].tags
   * 3. Fallback: convert deprecated ability field to tags (backward compatibility)
   *
   * @param modelKey - Model key in format: type@model@name
   * @param llmProviders - List of configured LLM providers (required for custom providers)
   */
  async getModelTags(modelKey: string, llmProviders: LLMProvider[]): Promise<GatewayModelTag[]> {
    const { type, model, name } = this.parseModelKey(modelKey);

    // AI Gateway models: get tags from gateway config
    if (type === LLMProviderType.AI_GATEWAY) {
      try {
        const gatewayModel = await this.getGatewayModelConfig(model);
        if (gatewayModel) {
          return this.addImageInputTagForImageGeneration(model, gatewayModel.tags ?? []);
        }
      } catch (error) {
        this.logger.warn(`[getModelTags] Failed to get gateway config for ${model}: ${error}`);
      }
      return [];
    }

    // Custom providers: get tags from modelConfigs
    const provider = llmProviders.find((p) => p.type === type && p.name === name);
    const modelConfig = provider?.modelConfigs?.[model];

    // Priority 1: Use tags if available
    if (modelConfig?.tags?.length) {
      return modelConfig.tags;
    }

    // Priority 2: Fallback to converting deprecated ability to tags
    if (modelConfig?.ability) {
      return this.abilityToTags(modelConfig.ability);
    }

    return [];
  }

  private addImageInputTagForImageGeneration(
    modelId: string,
    tags: readonly GatewayModelTag[]
  ): GatewayModelTag[] {
    const nextTags = [...tags];
    // Some image generation models accept image inputs but Gateway may only report
    // image-generation. Add vision so AI fields forward attachment source images.
    if (supportsImageInputForImageGeneration(modelId, nextTags) && !nextTags.includes('vision')) {
      nextTags.push('vision');
    }
    return nextTags;
  }

  /**
   * Convert deprecated IChatModelAbility to GatewayModelTag[]
   * Used for backward compatibility with old ability format
   */
  private abilityToTags(ability: IChatModelAbility): GatewayModelTag[] {
    const tags: GatewayModelTag[] = [];
    if (ability.image) tags.push('vision');
    if (ability.pdf) tags.push('file-input');
    if (ability.toolCall) tags.push('tool-use');
    if (ability.reasoning) tags.push('reasoning');
    if (ability.imageGeneration) tags.push('image-generation');
    return tags;
  }

  /**
   * Get gateway model pricing for billing calculation
   * First checks local gatewayModels config, then falls back to API
   */
  async getGatewayModelPricing(modelId: string) {
    // First check local config (admin-configured models)
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    const gatewayModels = aiConfig?.gatewayModels ?? [];
    const localModel = gatewayModels.find((m) => m.id === modelId);
    if (localModel?.pricing) {
      // Normalize handles both camelCase (admin UI) and snake_case (legacy stored data)
      const pricing = normalizeGatewayPricing(localModel.pricing);
      this.logger.debug(
        `[getGatewayModelPricing] Found local pricing for ${modelId}: ${JSON.stringify(pricing)}`
      );
      return pricing;
    }

    // If not found locally, fetch from API (already normalized by convertGatewayApiModel)
    try {
      const apiModel = await this.getGatewayApiModel(modelId);
      if (apiModel?.pricing) {
        this.logger.debug(
          `[getGatewayModelPricing] Found API pricing for ${modelId}: ${JSON.stringify(apiModel.pricing)}`
        );
        return apiModel.pricing;
      }
    } catch (error) {
      this.logger.warn(`[getGatewayModelPricing] Failed to fetch API pricing for ${modelId}`);
    }

    this.logger.debug(
      `[getGatewayModelPricing] No pricing found for ${modelId}, will use default rates`
    );
    return undefined;
  }

  /**
   * Get a specific model from Gateway API
   */
  private async getGatewayApiModel(modelId: string): Promise<IGatewayApiModel | undefined> {
    const models = await this.aiGatewayModelsService.getGatewayModels();
    const normalize = (s: string) =>
      s.split('/').pop()!.replaceAll('.', '').replaceAll('-', '').toLowerCase();
    const stripDateSuffix = (s: string) => s.replace(/\d{8,}$/, '');
    return models.find((m) => {
      const a = normalize(modelId);
      const b = normalize(m.id);
      if (a === b) return true;
      return stripDateSuffix(a) === stripDateSuffix(b);
    });
  }

  /**
   * Get attachment transfer mode from aiConfig
   * @returns 'url' (default) or 'base64'
   */
  async getAttachmentTransferMode(): Promise<'url' | 'base64'> {
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    return aiConfig?.attachmentTransferMode || 'url';
  }

  /**
   * Find the first model that supports vision capability from configured models.
   * Searches in order: gateway models (enabled), then custom llm providers.
   * Returns complete model info to avoid redundant lookups.
   *
   * @param llmProviders - List of configured LLM providers
   * @returns Complete vision model info, or undefined if none found
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async findFirstVisionModel(llmProviders: LLMProvider[]): Promise<
    | {
        modelKey: string;
        modelInstance: ILanguageModelV2;
        isInstance: boolean;
        tags: GatewayModelTag[];
      }
    | undefined
  > {
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);

    // 1. Check gateway models first (they are typically more capable)
    const gatewayModels = aiConfig?.gatewayModels ?? [];
    for (const model of gatewayModels) {
      if (!model.enabled) continue;

      if (model.tags?.includes('vision')) {
        const modelKey = this.buildGatewayModelKey(model.id);
        const modelInstance = await this.getModelInstance(modelKey, llmProviders);
        return {
          modelKey,
          modelInstance,
          isInstance: true, // Gateway models are always instance-level
          tags: model.tags,
        };
      }
    }

    // 2. Check custom LLM providers
    for (const provider of llmProviders) {
      const models = provider.models?.split(',').map((m) => m.trim()) ?? [];
      for (const model of models) {
        const modelConfig = provider.modelConfigs?.[model];
        if (!modelConfig) continue;

        // Check tags (new format) or ability (backward compatibility)
        const hasVision = modelConfig.tags?.includes('vision') || modelConfig.ability?.image;
        if (hasVision) {
          const modelKey = `${provider.type}@${model}@${provider.name}`;
          const modelInstance = await this.getModelInstance(modelKey, llmProviders);
          // Convert ability to tags for backward compatibility
          const tags: GatewayModelTag[] =
            modelConfig.tags ?? this.abilityToTags(modelConfig.ability ?? {});
          return {
            modelKey,
            modelInstance,
            isInstance: !!provider.isInstance,
            tags,
          };
        }
      }
    }

    return undefined;
  }
}
