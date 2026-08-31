import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { ByokKmsAuthService } from './byok-kms.auth.service';
import type {
  ICustomerKmsKey,
  IEnvelopeEncrypted,
  IKmsAuditEntry,
  IRotationPolicy,
  KmsProvider,
} from './byok-kms.types';

/**
 * BYOK KMS HTTP controller.
 *
 * Thin layer over ByokKmsAuthService. Customer master keys are registered
 * here, envelope encrypt/decrypt is performed under those keys, and every
 * operation appends to the audit log. The master key material is resolved
 * by IMasterKeyProvider (LocalMasterKeyProvider by default; swap for an
 * AWS / GCP / Vault provider in cloud deployments).
 *
 * Auth model: instance-level (admin panel). All routes require
 * `instance|read` or `instance|update`.
 */
@Controller('api/admin/byok-kms')
export class ByokKmsController {
  constructor(private readonly auth: ByokKmsAuthService) {}

  @Post('keys')
  @HttpCode(200)
  @Permissions('instance|update')
  async registerKey(
    @Body()
    body: {
      organizationId: string;
      alias: string;
      provider: KmsProvider;
      keyId: string;
      keyVersion?: string | null;
      rotationPolicy?: IRotationPolicy | null;
      createdBy: string;
    }
  ): Promise<ICustomerKmsKey> {
    if (!body?.organizationId || !body?.alias || !body?.keyId || !body?.createdBy) {
      throw new BadRequestException(
        'organizationId, alias, keyId, createdBy required'
      );
    }
    return this.auth.registerKey({
      organizationId: body.organizationId,
      alias: body.alias,
      provider: body.provider,
      keyId: body.keyId,
      keyVersion: body.keyVersion,
      rotationPolicy: body.rotationPolicy,
      createdBy: body.createdBy,
    });
  }

  @Get('keys/:orgId')
  @Permissions('instance|read')
  async listKeys(@Param('orgId') orgId: string): Promise<{ keys: ICustomerKmsKey[] }> {
    const keys = await this.auth.listKeys(orgId);
    return { keys };
  }

  @Get('keys/:orgId/:alias')
  @Permissions('instance|read')
  async getKey(
    @Param('orgId') orgId: string,
    @Param('alias') alias: string
  ): Promise<ICustomerKmsKey | null> {
    return this.auth.getKey(orgId, alias);
  }

  @Delete('keys/:orgId/:alias')
  @HttpCode(200)
  @Permissions('instance|update')
  async disableKey(
    @Param('orgId') orgId: string,
    @Param('alias') alias: string
  ): Promise<{ disabled: boolean }> {
    const key = await this.auth.disableKey(orgId, alias);
    return { disabled: Boolean(key) };
  }

  @Post('keys/:orgId/:alias/rotate')
  @HttpCode(200)
  @Permissions('instance|update')
  async rotateKey(
    @Param('orgId') orgId: string,
    @Param('alias') alias: string,
    @Body() body: { newKeyVersion: string }
  ): Promise<ICustomerKmsKey> {
    if (!body?.newKeyVersion) {
      throw new BadRequestException('newKeyVersion required');
    }
    return this.auth.rotateKey({
      organizationId: orgId,
      alias,
      newKeyVersion: body.newKeyVersion,
    });
  }

  @Get('rotation-due/:orgId')
  @Permissions('instance|read')
  async rotationDue(
    @Param('orgId') orgId: string
  ): Promise<{
    due: Array<{ key: ICustomerKmsKey; daysRemaining: number | null }>;
    count: number;
  }> {
    const due = await this.auth.listRotationDue(orgId);
    return { due, count: due.length };
  }

  /**
   * Encrypt plaintext under the org's customer master key.
   * Returns both the envelope (wrapped DEK) and the ciphertext blob so
   * the caller can pass them back unchanged to /decrypt.
   */
  @Post('encrypt')
  @HttpCode(200)
  @Permissions('instance|update')
  async encrypt(
    @Body()
    body: {
      organizationId: string;
      alias: string;
      plaintext: string;
      callerType?: 'service' | 'user' | 'system';
      callerId?: string;
    }
  ): Promise<{ envelope: IEnvelopeEncrypted; ciphertextRef: string }> {
    if (!body?.organizationId || !body?.alias || typeof body?.plaintext !== 'string') {
      throw new BadRequestException('organizationId, alias, plaintext required');
    }
    const out = await this.auth.encryptForOrg({
      organizationId: body.organizationId,
      alias: body.alias,
      plaintext: Buffer.from(body.plaintext, 'utf8'),
      ...(body.callerType ? { callerType: body.callerType } : {}),
      ...(body.callerId ? { callerId: body.callerId } : {}),
    });
    return { envelope: out.envelope, ciphertextRef: out.ciphertext.toString('base64') };
  }

  /**
   * Decrypt an envelope + ciphertext blob previously produced by /encrypt.
   */
  @Post('decrypt')
  @HttpCode(200)
  @Permissions('instance|update')
  async decrypt(
    @Body()
    body: {
      organizationId: string;
      alias: string;
      envelope: IEnvelopeEncrypted;
      ciphertextRef: string;
      callerType?: 'service' | 'user' | 'system';
      callerId?: string;
    }
  ): Promise<{ plaintext: string }> {
    if (
      !body?.organizationId ||
      !body?.alias ||
      !body?.envelope ||
      !body?.ciphertextRef
    ) {
      throw new BadRequestException(
        'organizationId, alias, envelope, ciphertextRef required'
      );
    }
    const plaintext = await this.auth.decryptForOrg({
      organizationId: body.organizationId,
      alias: body.alias,
      ciphertext: Buffer.from(body.ciphertextRef, 'base64'),
      envelope: body.envelope,
      ...(body.callerType ? { callerType: body.callerType } : {}),
      ...(body.callerId ? { callerId: body.callerId } : {}),
    });
    return { plaintext: plaintext.toString('utf8') };
  }

  @Get('audit/:orgId')
  @Permissions('instance|read')
  async audit(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string
  ): Promise<{ entries: IKmsAuditEntry[]; count: number }> {
    const parsed = limit !== undefined ? parseInt(limit, 10) : undefined;
    const entries = await this.auth.listAudit(
      parsed !== undefined && Number.isFinite(parsed)
        ? { organizationId: orgId, limit: parsed }
        : { organizationId: orgId }
    );
    return { entries, count: entries.length };
  }
}
