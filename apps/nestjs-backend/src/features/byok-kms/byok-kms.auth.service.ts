import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildKeyRow,
  daysUntilRotation,
  decryptWithDek,
  encryptWithDek,
  envelopeHash,
  generateDek,
  generateAlias,
  isRotationDue,
  isValidAlias,
  parseRotationPolicy,
  stringifyRotationPolicy,
  unwrapDek,
  wrapDek,
} from './byok-kms.service';
import type {
  ICustomerKmsKey,
  IEnvelopeEncrypted,
  IKmsAuditEntry,
  IRegisterKeyInput,
  IRotationPolicy,
  IUnwrappedDataKey,
  KmsOperation,
  KmsProvider,
} from './byok-kms.types';

/**
 * Pluggable master-key wrapper. The default LocalProvider uses a
 * caller-supplied master key (e.g. from env). Real AWS/GCP/Vault
 * implementations can be swapped in without touching envelope
 * encryption logic.
 */
export interface IMasterKeyProvider {
  readonly provider: KmsProvider;
  /** Resolve the raw 32-byte master key for the given org + keyId. */
  fetchMasterKey(input: {
    organizationId: string;
    keyId: string;
    keyVersion?: string | null;
  }): Buffer;
}

@Injectable()
export class LocalMasterKeyProvider implements IMasterKeyProvider {
  readonly provider: KmsProvider = 'local';
  private readonly masterKeys = new Map<string, Buffer>();
  constructor(@Optional() seedMaster?: Buffer) {
    if (seedMaster) this.masterKeys.set('__default__', seedMaster);
  }
  registerMaterial(keyId: string, raw: Buffer): void {
    if (raw.length !== 32) throw new BadRequestException('master key material must be 32 bytes');
    this.masterKeys.set(keyId, raw);
  }
  fetchMasterKey(input: {
    organizationId: string;
    keyId: string;
    keyVersion?: string | null;
  }): Buffer {
    const k = this.masterKeys.get(input.keyId) ?? this.masterKeys.get('__default__');
    if (!k) throw new NotFoundException(`master key not found: ${input.keyId}`);
    return k;
  }
}

@Injectable()
export class ByokKmsAuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: LocalMasterKeyProvider
  ) {}

  /**
   * Seed a default master key for the local provider when running in
   * non-production environments. The cloud deployment replaces the
   * LocalMasterKeyProvider with an AWS / GCP / Vault provider that
   * resolves customer keys externally, so seeding here is dev-only and
   * idempotent (skipped if a `__default__` key already exists).
   */
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'production') return;
    try {
      // fetchMasterKey throws NotFoundException when missing; we use it
      // as a cheap "does the provider already know __default__?" probe.
      this.provider.fetchMasterKey({ organizationId: '', keyId: '__default__' });
      return; // already seeded
    } catch {
      // expected — proceed to seed
    }
    try {
      const seed = Buffer.alloc(32, 0x42);
      this.provider.registerMaterial('__default__', seed);
      this.logger.log('Seeded default master key for LocalMasterKeyProvider');
    } catch {
      /* swallow — provider may not be LocalMasterKeyProvider */
    }
  }

  private readonly logger = new Logger(ByokKmsAuthService.name);

  async registerKey(input: IRegisterKeyInput): Promise<ICustomerKmsKey> {
    if (!isValidAlias(input.alias))
      throw new BadRequestException('alias must be kebab-case 3-64 chars');
    const dup = await this.prisma.customerKmsKey.findFirst({
      where: { organizationId: input.organizationId, alias: input.alias },
    });
    if (dup) throw new ConflictException(`alias already in use: ${input.alias}`);
    const id = `kms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildKeyRow({ id, ...input });
    const created = await this.prisma.customerKmsKey.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        alias: row.alias,
        provider: row.provider,
        keyId: row.keyId,
        keyVersion: row.keyVersion,
        status: row.status,
        rotationPolicyJson: stringifyRotationPolicy(row.rotationPolicy),
        createdBy: row.createdBy,
      },
    });
    return toKeyRow(created);
  }

  async disableKey(organizationId: string, alias: string): Promise<ICustomerKmsKey> {
    const existing = await this.prisma.customerKmsKey.findFirst({
      where: { organizationId, alias },
    });
    if (!existing) throw new NotFoundException(`key not found: ${alias}`);
    if (existing.status === 'pending-deletion')
      throw new BadRequestException('key pending deletion');
    const updated = await this.prisma.customerKmsKey.update({
      where: { id: existing.id },
      data: { status: 'disabled' },
    });
    return toKeyRow(updated);
  }

  async rotateKey(input: {
    organizationId: string;
    alias: string;
    newKeyVersion: string;
  }): Promise<ICustomerKmsKey> {
    const existing = await this.prisma.customerKmsKey.findFirst({
      where: { organizationId: input.organizationId, alias: input.alias },
    });
    if (!existing) throw new NotFoundException(`key not found: ${input.alias}`);
    if (existing.status !== 'enabled')
      throw new BadRequestException(`cannot rotate key in status ${existing.status}`);
    const updated = await this.prisma.customerKmsKey.update({
      where: { id: existing.id },
      data: { keyVersion: input.newKeyVersion },
    });
    await this.recordAudit({
      organizationId: input.organizationId,
      keyId: existing.keyId,
      operation: 'rotate',
      callerType: 'service',
      payloadHash: envelopeHash({
        keyId: existing.keyId,
        wrappedDek: input.newKeyVersion,
        algorithm: 'rotate',
        keyVersion: input.newKeyVersion,
      }),
    });
    return toKeyRow(updated);
  }

  async getKey(organizationId: string, alias: string): Promise<ICustomerKmsKey | null> {
    const row = await this.prisma.customerKmsKey.findFirst({ where: { organizationId, alias } });
    return row ? toKeyRow(row) : null;
  }

  async listKeys(organizationId: string): Promise<ICustomerKmsKey[]> {
    const rows = await this.prisma.customerKmsKey.findMany({ where: { organizationId } });
    return rows.map(toKeyRow);
  }

  async listRotationDue(
    organizationId: string,
    now?: Date
  ): Promise<Array<{ key: ICustomerKmsKey; daysRemaining: number | null }>> {
    const rows = await this.listKeys(organizationId);
    return rows
      .filter((k) => isRotationDue({ key: k, now }))
      .map((k) => ({ key: k, daysRemaining: daysUntilRotation({ key: k, now }) }));
  }

  /**
   * Encrypt-then-wrap: generate a fresh DEK, use it to encrypt
   * `plaintext`, wrap the DEK under the org's master key.
   */
  async encryptForOrg(input: {
    organizationId: string;
    alias: string;
    plaintext: Buffer;
    callerType?: 'service' | 'user' | 'system';
    callerId?: string;
  }): Promise<{ ciphertext: Buffer; envelope: IEnvelopeEncrypted }> {
    const key = await this.getKey(input.organizationId, input.alias);
    if (!key) throw new NotFoundException(`key not found: ${input.alias}`);
    if (key.status !== 'enabled')
      throw new BadRequestException(`key ${key.alias} is ${key.status}`);
    if (key.provider !== this.provider.provider) {
      throw new BadRequestException(
        `provider mismatch: stored=${key.provider} active=${this.provider.provider}`
      );
    }
    const dek = generateDek();
    const masterKey = this.provider.fetchMasterKey({
      organizationId: key.organizationId,
      keyId: key.keyId,
      keyVersion: key.keyVersion,
    });
    const envelope = wrapDek({ dek, masterKey, keyId: key.keyId, keyVersion: key.keyVersion });
    const ciphertext = encryptWithDek({ dek, plaintext: input.plaintext });
    await this.touchLastUsed(key.id);
    await this.recordAudit({
      organizationId: key.organizationId,
      keyId: key.keyId,
      operation: 'wrap',
      callerType: input.callerType ?? 'service',
      callerId: input.callerId,
      payloadHash: envelopeHash(envelope),
    });
    return { ciphertext, envelope };
  }

  async decryptForOrg(input: {
    organizationId: string;
    alias: string;
    ciphertext: Buffer;
    envelope: IEnvelopeEncrypted;
    callerType?: 'service' | 'user' | 'system';
    callerId?: string;
  }): Promise<Buffer> {
    const key = await this.getKey(input.organizationId, input.alias);
    if (!key) throw new NotFoundException(`key not found: ${input.alias}`);
    if (key.status !== 'enabled')
      throw new BadRequestException(`key ${key.alias} is ${key.status}`);
    if (input.envelope.keyId !== key.keyId)
      throw new BadRequestException('envelope keyId mismatch');
    const masterKey = this.provider.fetchMasterKey({
      organizationId: key.organizationId,
      keyId: key.keyId,
      keyVersion: key.keyVersion,
    });
    const unwrapped = unwrapDek({ envelope: input.envelope, masterKey });
    const plaintext = decryptWithDek({ dek: unwrapped.raw, blob: input.ciphertext });
    await this.touchLastUsed(key.id);
    await this.recordAudit({
      organizationId: key.organizationId,
      keyId: key.keyId,
      operation: 'unwrap',
      callerType: input.callerType ?? 'service',
      callerId: input.callerId,
      payloadHash: envelopeHash(input.envelope),
    });
    return plaintext;
  }

  async recordAudit(input: {
    organizationId: string;
    keyId: string;
    operation: KmsOperation;
    callerType: 'service' | 'user' | 'system';
    callerId?: string;
    payloadHash?: string;
  }): Promise<IKmsAuditEntry> {
    const id = `kmsa_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    const row = await this.prisma.kmsAuditEntry.create({
      data: {
        id,
        organizationId: input.organizationId,
        keyId: input.keyId,
        operation: input.operation,
        callerType: input.callerType,
        callerId: input.callerId ?? null,
        payloadHash: input.payloadHash ?? null,
      },
    });
    return toAuditRow(row);
  }

  async listAudit(input: { organizationId: string; limit?: number }): Promise<IKmsAuditEntry[]> {
    const rows = await this.prisma.kmsAuditEntry.findMany({
      where: { organizationId: input.organizationId },
      take: Math.min(input.limit ?? 100, 1_000),
      orderBy: { atTime: 'desc' },
    });
    return rows.map(toAuditRow);
  }

  /** Update lastUsedAt (best-effort, doesn't fail caller). */
  private async touchLastUsed(id: string): Promise<void> {
    try {
      await this.prisma.customerKmsKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
    } catch {
      // ignore
    }
  }
}

function toKeyRow(r: {
  id: string;
  organizationId: string;
  alias: string;
  provider: string;
  keyId: string;
  keyVersion: string | null;
  status: string;
  rotationPolicyJson: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
  lastUsedAt: Date | null;
}): ICustomerKmsKey {
  const policy: IRotationPolicy | null = parseRotationPolicy(r.rotationPolicyJson);
  return {
    id: r.id,
    organizationId: r.organizationId,
    alias: r.alias,
    provider: r.provider as ICustomerKmsKey['provider'],
    keyId: r.keyId,
    keyVersion: r.keyVersion,
    status: r.status as ICustomerKmsKey['status'],
    rotationPolicy: policy,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
    lastUsedAt: r.lastUsedAt,
  };
}

function toAuditRow(r: {
  id: string;
  organizationId: string;
  keyId: string;
  operation: string;
  callerType: string;
  callerId: string | null;
  payloadHash: string | null;
  atTime: Date;
}): IKmsAuditEntry {
  return {
    id: r.id,
    organizationId: r.organizationId,
    keyId: r.keyId,
    operation: r.operation as IKmsAuditEntry['operation'],
    callerType: r.callerType as IKmsAuditEntry['callerType'],
    callerId: r.callerId,
    payloadHash: r.payloadHash,
    atTime: r.atTime,
  };
}

export {
  generateDek,
  wrapDek,
  isRotationDue,
  daysUntilRotation,
  isValidAlias,
  generateAlias,
  envelopeHash,
  buildKeyRow,
};
