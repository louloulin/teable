/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Risk event query DSL — Stage 79.
 *
 * Reuses the Stage 52 audit-log-query pattern: a strongly-typed DSL
 * that compiles to Prisma `where` predicates. Supports time range,
 * severity/band, actor/org/decision filters, free-text on detail, and
 * stable pagination via cursor.
 */

export type RiskDecisionKind = 'allow' | 'challenge' | 'soft-block' | 'hard-block';
export type RiskBandKind = 'low' | 'medium' | 'high' | 'critical';
export type RiskEventKind = 'risk-decision' | 'login-attempt' | 'ban-action';
export type RiskOrdering = 'asc' | 'desc';

export interface IRiskEventCursor {
  /** Sort key value (typically occurredAt ISO). */
  key: string;
  /** Tie-breaker id. */
  id: string;
}

export interface IRiskEventFilter {
  orgIds?: string[];
  actorIds?: string[];
  decisions?: RiskDecisionKind[];
  bands?: RiskBandKind[];
  kinds?: RiskEventKind[];
  /** Inclusive lower bound (ISO). */
  from?: string;
  /** Exclusive upper bound (ISO). */
  to?: string;
  /** Free text on detail (case-insensitive substring). */
  text?: string;
  limit?: number;
  order?: RiskOrdering;
  cursor?: IRiskEventCursor;
}

export interface IRiskEventQuery {
  filter: IRiskEventFilter;
}

export interface IRiskEventRow {
  id: string;
  orgId: string;
  actorId: string;
  kind: RiskEventKind;
  decision: RiskDecisionKind | null;
  band: RiskBandKind | null;
  detail: string;
  occurredAt: string;
}

export const RISK_DEFAULT_LIMIT = 50;
export const RISK_MAX_LIMIT = 500;
export const RISK_MAX_TERM_LENGTH = 128;
export const RISK_MAX_ORGS_PER_QUERY = 32;
export const RISK_MAX_ACTORS_PER_QUERY = 64;

export const RISK_DECISION_KINDS: ReadonlyArray<RiskDecisionKind> = [
  'allow',
  'challenge',
  'soft-block',
  'hard-block',
];
export const RISK_BAND_KINDS: ReadonlyArray<RiskBandKind> = ['low', 'medium', 'high', 'critical'];
export const RISK_EVENT_KINDS: ReadonlyArray<RiskEventKind> = [
  'risk-decision',
  'login-attempt',
  'ban-action',
];
