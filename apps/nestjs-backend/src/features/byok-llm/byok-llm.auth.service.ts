/* eslint-disable @typescript-eslint/naming-convention */
/**
 * BYOK LLM isolation — NestJS auth service (Stage 66).
 *
 * Persists per-org LLM keys, daily usage rows, and call attempts
 * through Prisma. The single entry point used by the AI gateway is
 * `recordAndRoute()` which persists the attempt, updates the daily
 * usage, flips exhausted flags, and returns the chosen key.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildUsageRow,
  canRegisterMore,
  computeHealth,
  fingerprintKey,
  hashAttempt,
  normalizeProviderKey,
  routeRequest,
  shouldMarkExhausted,
  suggestAlias,
  validateProviderKey,
} from './byok-llm.service';
import type {
  ILlmCallAttempt,
  ILlmHealthSnapshot,
  ILlmProviderKey,
  ILlmRoutingDecision,
  ILlmRoutingOptions,
  ILlmUsageRow,
  LlmProvider,
} from './byok-llm.types';

@Injectable()
export class ByokLlmAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a provider key record. */
  validate(key: ILlmProviderKey): string[] {
    return validateProviderKey(key);
  }

  /** Load a single key by id. */
  async loadKey(id: string): Promise<ILlmProviderKey | null> {
    const row = await this.prisma.byokLlmKey.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  /** Load all keys for an org. */
  async listKeys(orgId: string): Promise<ILlmProviderKey[]> {
    const rows = await this.prisma.byokLlmKey.findMany({ where: { orgId } });
    return rows.map(toDomain);
  }

  /** Count keys for an org. */
  async countKeys(orgId: string): Promise<number> {
    return this.prisma.byokLlmKey.count({ where: { orgId } });
  }

  /** Whether the org can register another key. */
  async canRegister(orgId: string): Promise<boolean> {
    return canRegisterMore(await this.countKeys(orgId));
  }

  /** Suggest a human-readable alias (provider-aware). */
  suggestAlias(input: { provider: LlmProvider; friendlyName: string }): string {
    return suggestAlias(input);
  }

  /** Register a new key. Returns the persisted record. */
  async registerKey(input: {
    orgId: string;
    provider: LlmProvider;
    friendlyName: string;
    plaintext: string;
    ciphertextRef: string;
    isolation?: ILlmProviderKey['isolation'];
    orgDailyCap?: number;
    providerTpmCap?: number;
  }): Promise<ILlmProviderKey> {
    if (!(await this.canRegister(input.orgId))) {
      throw new Error('too many keys for org');
    }
    const alias = suggestAlias({
      provider: input.provider,
      friendlyName: input.friendlyName,
    });
    const fingerprint = fingerprintKey(input.plaintext);
    const key: ILlmProviderKey = normalizeProviderKey({
      id: `byok-${input.orgId}-${Date.now().toString(36)}`,
      orgId: input.orgId,
      provider: input.provider,
      alias,
      ciphertextRef: input.ciphertextRef,
      fingerprint,
      isolation: input.isolation ?? 'exclusive',
      orgDailyCap: input.orgDailyCap ?? 0,
      providerTpmCap: input.providerTpmCap ?? 0,
    });
    const errs = validateProviderKey(key);
    if (errs.length > 0) throw new Error(`invalid key: ${errs.join('; ')}`);
    await this.persistKey(key);
    return key;
  }

  /** Disable a key without losing its audit history. */
  async disableKey(id: string): Promise<boolean> {
    const key = await this.loadKey(id);
    if (!key) return false;
    key.status = 'disabled';
    key.updatedAt = new Date().toISOString();
    await this.persistKey(key);
    return true;
  }

  /** Persist the key record. */
  async persistKey(key: ILlmProviderKey): Promise<void> {
    await this.prisma.byokLlmKey.upsert({
      where: { id: key.id },
      create: {
        id: key.id,
        orgId: key.orgId,
        provider: key.provider,
        alias: key.alias,
        status: key.status,
        ciphertextRef: key.ciphertextRef,
        fingerprint: key.fingerprint,
        verifiedAt: key.verifiedAt ? new Date(key.verifiedAt) : null,
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
        providerTpmCap: key.providerTpmCap,
        orgDailyCap: key.orgDailyCap,
        isolation: key.isolation,
        createdAt: new Date(key.createdAt),
        updatedAt: new Date(key.updatedAt),
      },
      update: {
        alias: key.alias,
        status: key.status,
        ciphertextRef: key.ciphertextRef,
        fingerprint: key.fingerprint,
        verifiedAt: key.verifiedAt ? new Date(key.verifiedAt) : null,
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
        providerTpmCap: key.providerTpmCap,
        orgDailyCap: key.orgDailyCap,
        isolation: key.isolation,
        updatedAt: new Date(key.updatedAt),
      },
    });
  }

  /** Persist one usage row. */
  async upsertUsageRow(row: ILlmUsageRow): Promise<void> {
    await this.prisma.byokLlmUsage.upsert({
      where: { orgId_keyId_day: { orgId: row.orgId, keyId: row.keyId, day: row.day } },
      create: {
        orgId: row.orgId,
        keyId: row.keyId,
        provider: row.provider,
        day: row.day,
        tokens: BigInt(row.tokens),
        costCents: BigInt(row.costCents),
        requests: row.requests,
        errors: row.errors,
      },
      update: {
        provider: row.provider,
        tokens: BigInt(row.tokens),
        costCents: BigInt(row.costCents),
        requests: row.requests,
        errors: row.errors,
      },
    });
  }

  /** Persist a call attempt and the resulting usage row. */
  async recordAttempt(attempt: ILlmCallAttempt): Promise<ILlmUsageRow> {
    await this.prisma.byokLlmAttempt.create({
      data: {
        orgId: attempt.orgId,
        keyId: attempt.keyId,
        provider: attempt.provider,
        tokens: BigInt(attempt.tokens),
        costCents: BigInt(attempt.costCents),
        succeeded: attempt.succeeded,
        atIso: new Date(attempt.atIso),
        hash: hashAttempt(attempt),
      },
    });
    const day = attempt.atIso.slice(0, 10);
    const existing = await this.prisma.byokLlmAttempt.findMany({
      where: {
        orgId: attempt.orgId,
        keyId: attempt.keyId,
        atIso: { gte: new Date(`${day}T00:00:00Z`) },
      },
    });
    const attempts: ILlmCallAttempt[] = existing.map((r: ILlmCallAttempt) => ({
      orgId: r.orgId,
      keyId: r.keyId,
      provider: r.provider as LlmProvider,
      tokens: typeof r.tokens === 'bigint' ? Number(r.tokens) : r.tokens,
      costCents: typeof r.costCents === 'bigint' ? Number(r.costCents) : r.costCents,
      succeeded: r.succeeded,
      atIso: r.atIso,
    }));
    const row = buildUsageRow({
      orgId: attempt.orgId,
      keyId: attempt.keyId,
      provider: attempt.provider,
      day,
      attempts,
    });
    await this.upsertUsageRow(row);
    return row;
  }

  /** Resolve the next key for a request, persist the attempt, and update state. */
  async recordAndRoute(input: { attempt: ILlmCallAttempt; options?: ILlmRoutingOptions }): Promise<{
    decision: ILlmRoutingDecision;
    usage?: ILlmUsageRow;
    health?: ILlmHealthSnapshot;
  }> {
    const keys = await this.listKeys(input.attempt.orgId);
    const usageByKey = await this.loadDailyUsage(input.attempt.orgId, input.attempt.atIso, keys);
    const decision = routeRequest({
      orgId: input.attempt.orgId,
      keys,
      usageByKey,
      ...(input.options ? { options: input.options } : {}),
    });
    if (!decision.keyId) {
      return { decision };
    }
    const usage = await this.recordAttempt({ ...input.attempt, keyId: decision.keyId });
    await this.maybeFlipExhausted(keys, decision.keyId, usage);
    const health = await this.loadHealthFor(decision.keyId, decision.provider ?? 'custom');
    return { decision, usage, health };
  }

  private async loadDailyUsage(
    orgId: string,
    atIso: string,
    keys: ReadonlyArray<ILlmProviderKey>
  ): Promise<Record<string, ILlmUsageRow>> {
    const day = atIso.slice(0, 10);
    const out: Record<string, ILlmUsageRow> = {};
    for (const k of keys) {
      const row = await this.prisma.byokLlmUsage.findUnique({
        where: { orgId_keyId_day: { orgId, keyId: k.id, day } },
      });
      if (row) out[k.id] = usageRowFromDb(row);
    }
    return out;
  }

  private async maybeFlipExhausted(
    keys: ReadonlyArray<ILlmProviderKey>,
    keyId: string,
    usage: ILlmUsageRow
  ): Promise<void> {
    const target = keys.find((k) => k.id === keyId);
    if (!target) return;
    if (shouldMarkExhausted({ key: target, usage })) {
      await this.persistKey({ ...target, status: 'exhausted' });
    }
  }

  private async loadHealthFor(keyId: string, provider: LlmProvider): Promise<ILlmHealthSnapshot> {
    const rows = await this.prisma.byokLlmAttempt.findMany({
      where: { keyId, atIso: { gte: new Date(Date.now() - 60_000) } },
    });
    const attempts = rows.map((r: ILlmCallAttempt) =>
      attemptFromDb(r as unknown as Record<string, unknown>)
    );
    return computeHealth({ keyId, provider, attempts });
  }

  /** Compute the rolling health snapshot for one key. */
  async health(keyId: string): Promise<ILlmHealthSnapshot | null> {
    const key = await this.loadKey(keyId);
    if (!key) return null;
    const rows = await this.prisma.byokLlmAttempt.findMany({
      where: { keyId, atIso: { gte: new Date(Date.now() - 60_000) } },
    });
    const attempts: ILlmCallAttempt[] = rows.map((r: ILlmCallAttempt) => ({
      orgId: r.orgId,
      keyId: r.keyId,
      provider: r.provider as LlmProvider,
      tokens: typeof r.tokens === 'bigint' ? Number(r.tokens) : r.tokens,
      costCents: typeof r.costCents === 'bigint' ? Number(r.costCents) : r.costCents,
      succeeded: r.succeeded,
      atIso: r.atIso,
    }));
    return computeHealth({ keyId, provider: key.provider, attempts });
  }
}

function toDomain(row: Record<string, unknown>): ILlmProviderKey {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    provider: String(row['provider']) as LlmProvider,
    alias: String(row['alias'] ?? ''),
    status: String(row['status']) as ILlmProviderKey['status'],
    ciphertextRef: String(row['ciphertextRef'] ?? ''),
    fingerprint: String(row['fingerprint'] ?? ''),
    verifiedAt: row['verifiedAt'] ? new Date(String(row['verifiedAt'])).toISOString() : null,
    lastUsedAt: row['lastUsedAt'] ? new Date(String(row['lastUsedAt'])).toISOString() : null,
    providerTpmCap:
      typeof row['providerTpmCap'] === 'number' ? (row['providerTpmCap'] as number) : 0,
    orgDailyCap: typeof row['orgDailyCap'] === 'number' ? (row['orgDailyCap'] as number) : 0,
    isolation: row['isolation'] as ILlmProviderKey['isolation'],
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}

function usageRowFromDb(row: Record<string, unknown>): ILlmUsageRow {
  return {
    orgId: String(row['orgId']),
    keyId: String(row['keyId']),
    provider: String(row['provider']) as LlmProvider,
    day: String(row['day']),
    tokens: typeof row['tokens'] === 'bigint' ? Number(row['tokens']) : (row['tokens'] as number),
    costCents:
      typeof row['costCents'] === 'bigint'
        ? Number(row['costCents'])
        : (row['costCents'] as number),
    requests: typeof row['requests'] === 'number' ? (row['requests'] as number) : 0,
    errors: typeof row['errors'] === 'number' ? (row['errors'] as number) : 0,
  };
}

function attemptFromDb(row: Record<string, unknown>): ILlmCallAttempt {
  return {
    orgId: String(row['orgId']),
    keyId: String(row['keyId']),
    provider: String(row['provider']) as LlmProvider,
    tokens: typeof row['tokens'] === 'bigint' ? Number(row['tokens']) : (row['tokens'] as number),
    costCents:
      typeof row['costCents'] === 'bigint'
        ? Number(row['costCents'])
        : (row['costCents'] as number),
    succeeded: Boolean(row['succeeded']),
    atIso: new Date(String(row['atIso'])).toISOString(),
  };
}
