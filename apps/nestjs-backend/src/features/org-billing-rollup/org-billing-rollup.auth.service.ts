/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level billing rollup — NestJS auth service (Stage 69).
 *
 * Owns billing line items, credit notes, and the persisted rollup
 * cache. `produceRollup()` is the entry point: it pulls all line items
 * and credits for the org × period, runs the pure consolidation, and
 * stores the resulting rollup for the billing runner.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  consolidateLineItems,
  decideDunningLevel,
  exceedsCap,
  rollupAllOrgs,
  validateLineItem,
} from './org-billing-rollup.service';
import type {
  Currency,
  DunningLevel,
  IBillingCredit,
  IBillingLineItem,
  IBillingRollup,
  IOrgBillingRollupOptions,
} from './org-billing-rollup.types';

@Injectable()
export class OrgBillingRollupAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a line item — delegates to the pure helper. */
  validate(item: IBillingLineItem): string | null {
    return validateLineItem(item);
  }

  /** Persist a single line item (upsert). */
  async recordLineItem(item: IBillingLineItem): Promise<IBillingLineItem> {
    const err = validateLineItem(item);
    if (err) throw new Error(`invalid line item: ${err}`);
    await this.prisma.billingLineItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        orgId: item.orgId,
        baseId: item.baseId,
        kind: item.kind,
        incurredAt: new Date(item.incurredAt),
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        currency: item.currency,
        description: item.description,
      },
      update: {
        kind: item.kind,
        incurredAt: new Date(item.incurredAt),
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        currency: item.currency,
        description: item.description,
      },
    });
    return item;
  }

  /** List line items for an org in a period. */
  async listLineItems(input: {
    orgId: string;
    period: string;
    currency?: Currency;
  }): Promise<IBillingLineItem[]> {
    const rows = await this.prisma.billingLineItem.findMany({
      where: {
        orgId: input.orgId,
        ...(input.currency ? { currency: input.currency } : {}),
      },
      orderBy: { incurredAt: 'asc' },
    });
    return rows.map(toLineItem);
  }

  /** Record a credit note. */
  async recordCredit(credit: IBillingCredit): Promise<IBillingCredit> {
    await this.prisma.billingCredit.upsert({
      where: { id: credit.id },
      create: {
        id: credit.id,
        orgId: credit.orgId,
        appliedAt: new Date(credit.appliedAt),
        amountMinor: credit.amountMinor,
        currency: credit.currency,
        reason: credit.reason,
      },
      update: {
        appliedAt: new Date(credit.appliedAt),
        amountMinor: credit.amountMinor,
        currency: credit.currency,
        reason: credit.reason,
      },
    });
    return credit;
  }

  /** List credits for an org. */
  async listCredits(orgId: string): Promise<IBillingCredit[]> {
    const rows = await this.prisma.billingCredit.findMany({ where: { orgId } });
    return rows.map(toCredit);
  }

  /** Produce a rollup for one org × period × currency. */
  async produceRollup(input: {
    orgId: string;
    period: string;
    currency: Currency;
    daysPastDue?: number;
    options?: IOrgBillingRollupOptions;
    now?: string;
  }): Promise<IBillingRollup> {
    const items = await this.listLineItems({
      orgId: input.orgId,
      period: input.period,
      currency: input.currency,
    });
    const credits = await this.listCredits(input.orgId);
    if (exceedsCap({ items, orgId: input.orgId, period: input.period })) {
      throw new Error(`line item count exceeds cap for ${input.orgId}/${input.period}`);
    }
    const rollup = consolidateLineItems({
      items,
      credits,
      orgId: input.orgId,
      period: input.period,
      currency: input.currency,
      ...(input.daysPastDue !== undefined ? { daysPastDue: input.daysPastDue } : {}),
      ...(input.options ? { options: input.options } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    await this.persistRollup(rollup);
    return rollup;
  }

  /** Produce rollups for every (org, period, currency) combination. */
  async produceAllRollups(input?: {
    options?: IOrgBillingRollupOptions;
    now?: string;
  }): Promise<IBillingRollup[]> {
    const items = await this.listAllLineItems();
    const credits = await this.listAllCredits();
    const rollups = rollupAllOrgs({
      items,
      credits,
      ...(input?.options ? { options: input.options } : {}),
      ...(input?.now ? { now: input.now } : {}),
    });
    for (const r of rollups) {
      await this.persistRollup(r);
    }
    return rollups;
  }

  /** Load a persisted rollup. */
  async loadRollup(input: {
    orgId: string;
    period: string;
    currency: Currency;
  }): Promise<IBillingRollup | null> {
    const row = await this.prisma.billingRollup.findUnique({
      where: {
        orgId_period_currency: {
          orgId: input.orgId,
          period: input.period,
          currency: input.currency,
        },
      },
    });
    return row ? toRollup(row) : null;
  }

  /** Decide a dunning level for a given days-past-due. */
  decideDunningLevel(input: {
    daysPastDue: number;
    options?: IOrgBillingRollupOptions;
  }): DunningLevel {
    return decideDunningLevel(input);
  }

  /** List all line items — admin path. */
  private async listAllLineItems(): Promise<IBillingLineItem[]> {
    const rows = await this.prisma.billingLineItem.findMany({
      orderBy: { incurredAt: 'asc' },
    });
    return rows.map(toLineItem);
  }

  /** List all credits — admin path. */
  private async listAllCredits(): Promise<IBillingCredit[]> {
    const rows = await this.prisma.billingCredit.findMany();
    return rows.map(toCredit);
  }

  /** Persist a rollup snapshot. */
  private async persistRollup(rollup: IBillingRollup): Promise<void> {
    await this.prisma.billingRollup.upsert({
      where: {
        orgId_period_currency: {
          orgId: rollup.orgId,
          period: rollup.period,
          currency: rollup.currency,
        },
      },
      create: {
        orgId: rollup.orgId,
        period: rollup.period,
        currency: rollup.currency,
        grossMinor: rollup.grossMinor,
        creditsMinor: rollup.creditsMinor,
        netMinor: rollup.netMinor,
        lineCount: rollup.lineCount,
        baseCount: rollup.baseCount,
        dunningLevel: rollup.dunningLevel,
        byKind: rollup.byKind as unknown as object,
        generatedAt: new Date(rollup.generatedAt),
      },
      update: {
        grossMinor: rollup.grossMinor,
        creditsMinor: rollup.creditsMinor,
        netMinor: rollup.netMinor,
        lineCount: rollup.lineCount,
        baseCount: rollup.baseCount,
        dunningLevel: rollup.dunningLevel,
        byKind: rollup.byKind as unknown as object,
        generatedAt: new Date(rollup.generatedAt),
      },
    });
  }
}

function toLineItem(row: Record<string, unknown>): IBillingLineItem {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    baseId: String(row['baseId']),
    kind: String(row['kind']) as IBillingLineItem['kind'],
    incurredAt: new Date(String(row['incurredAt'] ?? Date.now())).toISOString(),
    quantity: typeof row['quantity'] === 'number' ? (row['quantity'] as number) : 0,
    unitPriceMinor:
      typeof row['unitPriceMinor'] === 'number' ? (row['unitPriceMinor'] as number) : 0,
    currency: String(row['currency']) as Currency,
    description: String(row['description'] ?? ''),
  };
}

function toCredit(row: Record<string, unknown>): IBillingCredit {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    appliedAt: new Date(String(row['appliedAt'] ?? Date.now())).toISOString(),
    amountMinor: typeof row['amountMinor'] === 'number' ? (row['amountMinor'] as number) : 0,
    currency: String(row['currency']) as Currency,
    reason: String(row['reason'] ?? ''),
  };
}

function toRollup(row: Record<string, unknown>): IBillingRollup {
  return {
    orgId: String(row['orgId']),
    period: String(row['period']),
    currency: String(row['currency']) as Currency,
    grossMinor: typeof row['grossMinor'] === 'number' ? (row['grossMinor'] as number) : 0,
    creditsMinor: typeof row['creditsMinor'] === 'number' ? (row['creditsMinor'] as number) : 0,
    netMinor: typeof row['netMinor'] === 'number' ? (row['netMinor'] as number) : 0,
    lineCount: typeof row['lineCount'] === 'number' ? (row['lineCount'] as number) : 0,
    baseCount: typeof row['baseCount'] === 'number' ? (row['baseCount'] as number) : 0,
    dunningLevel: String(row['dunningLevel'] ?? 'current') as DunningLevel,
    byKind:
      typeof row['byKind'] === 'object' && row['byKind'] !== null
        ? (row['byKind'] as IBillingRollup['byKind'])
        : {},
    generatedAt: new Date(String(row['generatedAt'] ?? Date.now())).toISOString(),
  };
}
