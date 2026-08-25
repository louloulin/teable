/**
 * Billing — Stage 32 types.
 *
 * Stripe-shaped but Cloud-friendly: subscriptions, invoices, and
 * idempotent webhook event records.
 */

export type SubscriptionStatus =
  | 'incomplete'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'trialing';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type BillingPlanCode = 'free' | 'pro' | 'team' | 'business' | 'enterprise';

export interface ISubscription {
  id: string;
  organizationId: string;
  planCode: BillingPlanCode;
  status: SubscriptionStatus;
  externalSubscriptionId: string;
  externalCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  seats: number;
  createdTime: Date;
  updatedTime: Date;
}

export interface IInvoice {
  id: string;
  subscriptionId: string;
  externalInvoiceId: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
}

export interface IWebhookEvent {
  id: string;
  externalEventId: string;
  eventType: string;
  receivedAt: Date;
  payloadJson: string;
  processedAt: Date | null;
  processingError: string | null;
}

export interface ICreateSubscriptionInput {
  organizationId: string;
  planCode: BillingPlanCode;
  externalSubscriptionId: string;
  externalCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  seats?: number;
}

export interface IUpdateSubscriptionInput {
  planCode?: BillingPlanCode;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  seats?: number;
}

export interface ICreateInvoiceInput {
  subscriptionId: string;
  externalInvoiceId: string;
  amountCents: number;
  currency?: string;
  status?: InvoiceStatus;
  periodStart: Date;
  periodEnd: Date;
}

export interface IResolvedWebhook {
  event: IWebhookEvent;
  alreadyProcessed: boolean;
  payload: Record<string, unknown>;
}

export type BillingEventHandler = (payload: Record<string, unknown>) => Promise<void>;

export interface IPlanDescriptor {
  code: BillingPlanCode;
  displayName: string;
  monthlyCents: number;
  seatLimit: number | null;
}

export const PLAN_TABLE: ReadonlyArray<IPlanDescriptor> = [
  { code: 'free', displayName: 'Free', monthlyCents: 0, seatLimit: 5 },
  { code: 'pro', displayName: 'Pro', monthlyCents: 1_200, seatLimit: 20 },
  { code: 'team', displayName: 'Team', monthlyCents: 2_900, seatLimit: 100 },
  { code: 'business', displayName: 'Business', monthlyCents: 7_900, seatLimit: 1_000 },
  { code: 'enterprise', displayName: 'Enterprise', monthlyCents: 0, seatLimit: null },
];
