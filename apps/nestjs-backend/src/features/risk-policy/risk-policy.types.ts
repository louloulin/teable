/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Risk policy engine — Stage 75.
 *
 * Wraps the empty risk-control.service scaffold with a real policy model:
 * risk score bands → action (allow/challenge/soft-block/hard-block),
 * rule composition (signals + thresholds), and decision persistence.
 */

export type RiskAction = 'allow' | 'challenge' | 'soft-block' | 'hard-block';
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';
export type RiskSignalKind =
  | 'login.new-device'
  | 'login.new-location'
  | 'login.failed-burst'
  | 'api.rate-burst'
  | 'export.large-dataset'
  | 'permission.escalation'
  | 'quota.spike';

export interface IRiskSignal {
  kind: RiskSignalKind;
  weight: number;
  detail: string;
  occurredAt: string;
}

export interface IRiskRule {
  id: string;
  orgId: string;
  name: string;
  enabled: boolean;
  signals: IRiskSignal[];
  /** Threshold band above which the rule fires. */
  thresholdBand: RiskBand;
  /** Action the rule triggers when fired. */
  action: RiskAction;
  /** Optional actor id to skip (e.g. system actor). */
  exemptActorIds: string[];
}

export interface IRiskPolicy {
  id: string;
  orgId: string;
  /** Decision overrides applied across all rules. */
  defaultAction: RiskAction;
  rules: IRiskRule[];
  /** If true, every action is mirrored to the audit log. */
  auditAll: boolean;
  updatedAt: string;
}

export interface IRiskDecision {
  id: string;
  orgId: string;
  actorId: string;
  score: number;
  band: RiskBand;
  action: RiskAction;
  /** Rules that fired (id + which signal pushed it over the threshold). */
  firedRules: { ruleId: string; signal: RiskSignalKind; detail: string }[];
  detail: string;
  createdAt: string;
}

export const RISK_BANDS: ReadonlyArray<RiskBand> = ['low', 'medium', 'high', 'critical'];
export const RISK_ACTIONS: ReadonlyArray<RiskAction> = [
  'allow',
  'challenge',
  'soft-block',
  'hard-block',
];
export const RISK_SIGNAL_KINDS: ReadonlyArray<RiskSignalKind> = [
  'login.new-device',
  'login.new-location',
  'login.failed-burst',
  'api.rate-burst',
  'export.large-dataset',
  'permission.escalation',
  'quota.spike',
];

export const BAND_THRESHOLDS: Record<RiskBand, number> = {
  low: 0,
  medium: 30,
  high: 60,
  critical: 90,
};

export const MAX_RULES_PER_POLICY = 64;
export const MAX_SIGNALS_PER_RULE = 16;
export const MAX_WEIGHT = 100;
export const DEFAULT_RISK_SCORE_FLOOR = 0;
export const DEFAULT_RISK_SCORE_CEIL = 100;

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

export const RISK_ACTION_LABELS: Record<RiskAction, string> = {
  allow: '允许',
  challenge: '验证',
  'soft-block': '软拦截',
  'hard-block': '硬拦截',
};
