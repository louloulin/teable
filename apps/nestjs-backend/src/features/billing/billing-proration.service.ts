/**
 * Billing proration math (Phase 5.1).
 *
 * Pure functions — no Stripe calls, no DB writes, no IO. Callers pair
 * the resulting `IProrationPreview` with their preferred persisting
 * transport (Stripe subscription items.update + invoice.create, or the
 * internal Subscription row when self-managed).
 *
 * Conventions used throughout:
 *   - All money values are integer cents of `currency`.
 *   - Period boundaries are inclusive of `start` and exclusive of `end`.
 *   - When the `now` timestamp is outside the period the function
 *     returns a zero proration rather than throwing, so controllers can
 *     still emit a billing-side invoice after the period has elapsed
 *     (e.g. for back-dated corrections).
 *
 * Cloud parity: this module mirrors the math that Stripe uses for
 * `proration_behavior: 'create_prorations'` so internal plan / seat
 * changes produce the same proration cents the Stripe webhook will
 * subsequently report.
 */
import { Injectable } from '@nestjs/common';
import type { BillingPlanCode } from './billing.types';

/** Inclusive period start (current billing cycle starts). */
export interface IProrationPeriod {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Wall clock at which the change is being evaluated. */
  asOf?: Date;
}

/** Pricing metadata for a single plan code. */
export interface IPlanRate {
  /** Cents per seat per full month, charged up-front in `monthly` mode. */
  monthlyPriceCentsPerSeat: number;
  /** ISO 4217 currency. */
  currency: string;
}

/** Inputs for `previewSeatChange`. */
export interface ISeatChangePreviewInput extends IProrationPeriod {
  currentSeats: number;
  /** May be positive (upgrade) or negative (downgrade). */
  deltaSeats: number;
  rate: IPlanRate;
}

/** Inputs for `previewPlanChange`. */
export interface IPlanChangePreviewInput extends IProrationPeriod {
  currentSeats: number;
  currentPlanCode: BillingPlanCode;
  newSeats: number;
  newPlanCode: BillingPlanCode;
  rateCard: Partial<Record<BillingPlanCode, IPlanRate>>;
}

/** Result of any proration preview. */
export interface IProrationPreview {
  /** Net cents owed now (positive) or credited (negative). Always
   *  expressed against the new rate card. May be 0 for a no-op. */
  prorationCents: number;
  /** Currency for the proration line item. */
  currency: string;
  /** Remaining fraction of the period at `asOf`, in [0,1]. */
  remainingRatio: number;
  /** True when the change is a no-op (zero seats delta AND zero rate
   *  delta) — the caller can skip persisting. */
  noOp: boolean;
  /** Total seconds remaining in the period at `asOf`. */
  remainingSeconds: number;
  /** Total seconds in the period (denominator). */
  periodSeconds: number;
}

const MS_PER_SECOND = 1000;

@Injectable()
export class BillingProrationService {
  /**
   * Computes the prorated cents for a seat-only change within the
   * same plan. Falls back to a zero proration when called outside the
   * period or with a zero delta.
   */
  previewSeatChange(input: ISeatChangePreviewInput): IProrationPreview {
    const asOf = input.asOf ?? new Date();
    const { numerator, denominator } = fractionRemaining(input, asOf);
    const noOp = input.deltaSeats === 0;
    if (noOp || denominator === 0) {
      return {
        prorationCents: 0,
        currency: input.rate.currency,
        remainingRatio: 0,
        noOp: true,
        remainingSeconds: Math.max(0, Math.floor(numerator / MS_PER_SECOND)),
        periodSeconds: Math.floor(denominator / MS_PER_SECOND),
      };
    }
    const monthlyFullCents = input.rate.monthlyPriceCentsPerSeat * input.deltaSeats;
    const prorated = Math.round((monthlyFullCents * numerator) / denominator);
    return {
      prorationCents: prorated,
      currency: input.rate.currency,
      remainingRatio: numerator / denominator,
      noOp: false,
      remainingSeconds: Math.max(0, Math.floor(numerator / MS_PER_SECOND)),
      periodSeconds: Math.floor(denominator / MS_PER_SECOND),
    };
  }

  /**
   * Computes the prorated cents for a plan change (with optional seat
   * change in the same call). Returns a positive value when the new
   * plan/seat mix costs more over the remaining period; negative when
   * it costs less (credit). Returns zero outside the period or for a
   * no-op (same plan, same seats).
   */
  previewPlanChange(input: IPlanChangePreviewInput): IProrationPreview {
    const asOf = input.asOf ?? new Date();
    const { numerator, denominator } = fractionRemaining(input, asOf);
    const samePlan = input.currentPlanCode === input.newPlanCode;
    const sameSeats = input.currentSeats === input.newSeats;
    const noOp = samePlan && sameSeats;
    if (noOp || denominator === 0) {
      return {
        prorationCents: 0,
        currency: pickCurrency(input.rateCard, input.newPlanCode, 'USD'),
        remainingRatio: 0,
        noOp,
        remainingSeconds: Math.max(0, Math.floor(numerator / MS_PER_SECOND)),
        periodSeconds: Math.floor(denominator / MS_PER_SECOND),
      };
    }
    const currentRate = input.rateCard[input.currentPlanCode];
    const newRate = input.rateCard[input.newPlanCode];
    if (!currentRate || !newRate) {
      throw new Error(
        `missing rate for plan (${currentRate ? '' : input.currentPlanCode}${
          currentRate && !newRate ? ',' : ''
        }${newRate ? '' : input.newPlanCode})`
      );
    }
    if (currentRate.currency !== newRate.currency) {
      throw new Error(
        `currency mismatch between ${input.currentPlanCode} (${currentRate.currency}) and ${input.newPlanCode} (${newRate.currency})`
      );
    }
    const currentFullCents =
      currentRate.monthlyPriceCentsPerSeat * input.currentSeats;
    const newFullCents = newRate.monthlyPriceCentsPerSeat * input.newSeats;
    const currentProrated = Math.round((currentFullCents * numerator) / denominator);
    const newProrated = Math.round((newFullCents * numerator) / denominator);
    return {
      prorationCents: newProrated - currentProrated,
      currency: newRate.currency,
      remainingRatio: numerator / denominator,
      noOp: false,
      remainingSeconds: Math.max(0, Math.floor(numerator / MS_PER_SECOND)),
      periodSeconds: Math.floor(denominator / MS_PER_SECOND),
    };
  }

  /** Returns the floor-divisor seconds of `asOf` to `currentPeriodEnd`. */
  remainingSecondsInPeriod(input: IProrationPeriod, asOf: Date = new Date()): number {
    const start = input.currentPeriodStart.getTime();
    const end = input.currentPeriodEnd.getTime();
    const now = asOf.getTime();
    if (now < start) return Math.floor((end - start) / MS_PER_SECOND);
    if (now >= end) return 0;
    return Math.floor((end - now) / MS_PER_SECOND);
  }
}

function fractionRemaining(
  input: IProrationPeriod,
  asOf: Date
): { numerator: number; denominator: number } {
  const start = input.currentPeriodStart.getTime();
  const end = input.currentPeriodEnd.getTime();
  const now = asOf.getTime();
  const denominator = end - start;
  if (denominator <= 0) return { numerator: 0, denominator: 0 };
  if (now <= start) return { numerator: denominator, denominator };
  if (now >= end) return { numerator: 0, denominator };
  return { numerator: end - now, denominator };
}

function pickCurrency(
  rateCard: Partial<Record<BillingPlanCode, IPlanRate>>,
  fallback: BillingPlanCode,
  defaultCurrency: string
): string {
  for (const code of Object.keys(rateCard) as BillingPlanCode[]) {
    const r = rateCard[code];
    if (r) return r.currency;
  }
  void fallback;
  return defaultCurrency;
}
