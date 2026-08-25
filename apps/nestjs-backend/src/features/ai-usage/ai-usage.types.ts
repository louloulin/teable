/**
 * AI usage breakdown (model × action) — Stage 29 types.
 *
 * Stage 26 covered the flat ledger. Stage 29 collapses per
 * (organization, model, action, monthBucket) into a running counter
 * so the dashboard can answer "how much did gpt-4o-mini embeddings
 * cost this month?" without scanning the full ledger.
 */

export interface IAiUsageBucket {
  id: string;
  organizationId: string;
  model: string;
  action: string;
  credits: number;
  eventCount: number;
  monthBucket: string;
  updatedTime: Date;
}

export interface IRecordUsageInput {
  organizationId: string;
  model: string;
  action: string;
  credits: number;
  monthBucket?: string;
}

export interface IAiUsageSummary {
  organizationId: string;
  monthBucket: string;
  total: number;
  byModel: Array<{ model: string; credits: number; events: number }>;
  byAction: Array<{ action: string; credits: number; events: number }>;
}

export interface IAiCreditGrantPolicy {
  organizationId: string;
  monthlyLimit: number;
  carryCap: number;
  perModelCap: Record<string, number>;
}
