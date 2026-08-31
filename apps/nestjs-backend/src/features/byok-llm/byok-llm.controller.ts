import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { ByokLlmAuthService } from './byok-llm.auth.service';
import {
  ALL_LLM_PROVIDERS,
  fingerprintKey,
  routeRequest,
  suggestAlias,
  validateProviderKey,
} from './byok-llm.service';
import {
  ILlmProviderKey,
  ILlmRoutingDecision,
  ILlmRoutingOptions,
  ILlmUsageRow,
  LlmKeyStatus,
  LlmProvider,
  LLM_PROVIDER_LABELS,
  MAX_LLM_KEYS_PER_ORG,
} from './byok-llm.types';

/**
 * BYOK LLM HTTP controller.
 *
 * Thin layer over ByokLlmAuthService. Persists per-org provider keys,
 * exposes health snapshots, and resolves routing decisions for the AI
 * gateway to consume. Ciphertext envelopes are produced out-of-band by
 * the byok-kms module — the controller does not see plaintext.
 *
 * Auth model: instance-level (admin panel). All routes require
 * `instance|read` or `instance|update` via the standard Permissions
 * decorator. For org-scoped reads the orgId is part of the path.
 */
@Controller('api/admin/byok-llm')
export class ByokLlmController {
  constructor(private readonly auth: ByokLlmAuthService) {}

  /** Enumerate the providers the system understands. */
  @Get('providers')
  @Permissions('instance|read')
  providers(): {
    providers: LlmProvider[];
    labels: Record<LlmProvider, string>;
    maxKeysPerOrg: number;
  } {
    return {
      providers: [...ALL_LLM_PROVIDERS],
      labels: LLM_PROVIDER_LABELS,
      maxKeysPerOrg: MAX_LLM_KEYS_PER_ORG,
    };
  }

  @Get('keys/:orgId')
  @Permissions('instance|read')
  async listKeys(@Param('orgId') orgId: string): Promise<{ keys: ILlmProviderKey[] }> {
    const keys = await this.auth.listKeys(orgId);
    return { keys };
  }

  @Get('keys/:orgId/count')
  @Permissions('instance|read')
  async countKeys(@Param('orgId') orgId: string): Promise<{ count: number }> {
    const count = await this.auth.countKeys(orgId);
    return { count };
  }

  @Get('keys/:orgId/can-register')
  @Permissions('instance|read')
  async canRegister(@Param('orgId') orgId: string): Promise<{ canRegister: boolean }> {
    const ok = await this.auth.canRegister(orgId);
    return { canRegister: ok };
  }

  /**
   * Register a new key. Body MUST NOT include plaintext in production;
   * for local/dev convenience plaintext may be passed and will be
   * fingerprinted only (never persisted). The actual ciphertext envelope
   * is produced by the byok-kms module.
   */
  @Post('keys/:orgId')
  @HttpCode(200)
  @Permissions('instance|update')
  async registerKey(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      provider: LlmProvider;
      friendlyName: string;
      ciphertextRef: string;
      plaintext?: string;
      isolation?: ILlmProviderKey['isolation'];
      orgDailyCap?: number;
      providerTpmCap?: number;
    }
  ): Promise<ILlmProviderKey> {
    if (!body?.provider || !ALL_LLM_PROVIDERS.includes(body.provider)) {
      throw new BadRequestException(`provider required, one of: ${ALL_LLM_PROVIDERS.join(', ')}`);
    }
    if (!body?.ciphertextRef || typeof body.ciphertextRef !== 'string') {
      throw new BadRequestException('ciphertextRef required');
    }
    if (!body?.friendlyName || typeof body.friendlyName !== 'string') {
      throw new BadRequestException('friendlyName required');
    }
    const fingerprint = body.plaintext ? fingerprintKey(body.plaintext) : '';
    const alias = suggestAlias({ provider: body.provider, friendlyName: body.friendlyName });
    const candidate: ILlmProviderKey = {
      id: `byok-${orgId}-pending`,
      orgId,
      provider: body.provider,
      alias,
      status: 'active' as LlmKeyStatus,
      ciphertextRef: body.ciphertextRef,
      fingerprint,
      verifiedAt: null,
      lastUsedAt: null,
      providerTpmCap: body.providerTpmCap ?? 0,
      orgDailyCap: body.orgDailyCap ?? 0,
      isolation: body.isolation ?? 'exclusive',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const errors = validateProviderKey(candidate);
    if (errors.length > 0) {
      throw new BadRequestException(`invalid key: ${errors.join('; ')}`);
    }
    if (!(await this.auth.canRegister(orgId))) {
      throw new BadRequestException(`org has reached key cap (${MAX_LLM_KEYS_PER_ORG})`);
    }
    return this.auth.registerKey({
      orgId,
      provider: body.provider,
      friendlyName: body.friendlyName,
      plaintext: body.plaintext ?? '',
      ciphertextRef: body.ciphertextRef,
      isolation: body.isolation,
      orgDailyCap: body.orgDailyCap,
      providerTpmCap: body.providerTpmCap,
    });
  }

  @Get('keys/id/:keyId')
  @Permissions('instance|read')
  async loadKey(@Param('keyId') keyId: string): Promise<ILlmProviderKey | null> {
    return this.auth.loadKey(keyId);
  }

  @Delete('keys/:keyId')
  @HttpCode(200)
  @Permissions('instance|update')
  async disableKey(@Param('keyId') keyId: string): Promise<{ disabled: boolean }> {
    const ok = await this.auth.disableKey(keyId);
    return { disabled: ok };
  }

  @Get('keys/:keyId/health')
  @Permissions('instance|read')
  async health(
    @Param('keyId') keyId: string
  ): Promise<Awaited<ReturnType<ByokLlmAuthService['health']>>> {
    const h = await this.auth.health(keyId);
    if (!h) throw new BadRequestException(`key not found: ${keyId}`);
    return h;
  }

  /**
   * Resolve which key should serve the next call for a given org.
   * Pure routing decision — does NOT record an attempt. Recording happens
   * separately via the AI gateway after a call completes.
   */
  @Post('route')
  @HttpCode(200)
  @Permissions('instance|read')
  async route(
    @Body()
    body: {
      orgId: string;
      options?: ILlmRoutingOptions;
    }
  ): Promise<{ decision: ILlmRoutingDecision }> {
    if (!body?.orgId) throw new BadRequestException('orgId required');
    const keys = await this.auth.listKeys(body.orgId);
    const usageByKey: Record<string, ILlmUsageRow> = {};
    const decision = routeRequest({
      orgId: body.orgId,
      keys,
      usageByKey,
      ...(body.options ? { options: body.options } : {}),
    });
    return { decision };
  }
}
