/**
 * AI credit tracking — Stage 26 types.
 */

export type AiCreditAction = 'charge' | 'refund' | 'grant';

export interface IAiCreditEntry {
  id: string;
  organizationId: string;
  action: AiCreditAction;
  credits: number;
  provider: string | null;
  sourceRef: string | null;
  monthBucket: string;
  createdTime: Date;
}

export interface IAiCreditUsageRow {
  monthBucket: string;
  /** Sum of credits consumed in the month (charges are negative-signed). */
  consumed: number;
  /** Sum of credits granted (admin grants + refunds). */
  granted: number;
  /** granted - consumed (positive = remaining allowance, negative = over-budget). */
  net: number;
  /** Total charge events counted in the month. */
  chargeCount: number;
}

export interface IAiCreditCheckInput {
  organizationId: string;
  /** The estimated credits the operation will consume. */
  estimatedCredits: number;
  /** Optional explicit month bucket — defaults to current month. */
  monthBucket?: string;
}

export interface IAiCreditCheckResult {
  allowed: boolean;
  monthBucket: string;
  consumed: number;
  limit: number;
  /** How many credits remain after the proposed charge. */
  remaining: number;
}
