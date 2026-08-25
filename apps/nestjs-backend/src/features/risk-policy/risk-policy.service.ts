/**
 * Risk policy engine — pure helpers (Stage 75).
 */

import type {
  IRiskDecision,
  IRiskPolicy,
  IRiskRule,
  IRiskSignal,
  RiskAction,
  RiskBand,
  RiskSignalKind,
} from './risk-policy.types';
import {
  BAND_THRESHOLDS,
  DEFAULT_RISK_SCORE_CEIL,
  DEFAULT_RISK_SCORE_FLOOR,
  MAX_RULES_PER_POLICY,
  MAX_SIGNALS_PER_RULE,
  MAX_WEIGHT,
  RISK_ACTIONS,
  RISK_BANDS,
  RISK_SIGNAL_KINDS,
} from './risk-policy.types';

/** Whether the value is a canonical risk band. */
export function isRiskBand(s: string): s is RiskBand {
  return (RISK_BANDS as ReadonlyArray<string>).includes(s);
}

/** Whether the value is a canonical risk action. */
export function isRiskAction(s: string): s is RiskAction {
  return (RISK_ACTIONS as ReadonlyArray<string>).includes(s);
}

/** Whether the value is a canonical signal kind. */
export function isRiskSignalKind(s: string): s is RiskSignalKind {
  return (RISK_SIGNAL_KINDS as ReadonlyArray<string>).includes(s);
}

/** Max rules per policy. */
export function maxRulesPerPolicy(): number {
  return MAX_RULES_PER_POLICY;
}

/** Max signals per rule. */
export function maxSignalsPerRule(): number {
  return MAX_SIGNALS_PER_RULE;
}

/** Score ceiling. */
export function maxScore(): number {
  return DEFAULT_RISK_SCORE_CEIL;
}

/** Score floor. */
export function minScore(): number {
  return DEFAULT_RISK_SCORE_FLOOR;
}

/** Compute the band from a numeric score. */
export function bandFromScore(score: number): RiskBand {
  const clamped = Math.max(0, Math.min(DEFAULT_RISK_SCORE_CEIL, score));
  if (clamped >= BAND_THRESHOLDS.critical) return 'critical';
  if (clamped >= BAND_THRESHOLDS.high) return 'high';
  if (clamped >= BAND_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/** Validate a signal. */
export function validateSignal(s: IRiskSignal): string | null {
  if (!isRiskSignalKind(s.kind)) return `unknown kind: ${s.kind}`;
  if (s.weight < 0 || s.weight > MAX_WEIGHT) {
    return `weight must be 0..${MAX_WEIGHT}`;
  }
  if (!s.detail) return 'detail required';
  if (!s.occurredAt) return 'occurredAt required';
  return null;
}

/** Validate a rule. */
export function validateRule(rule: IRiskRule): string | null {
  if (!rule.id) return 'id required';
  if (!rule.orgId) return 'orgId required';
  if (!rule.name) return 'name required';
  if (rule.signals.length > MAX_SIGNALS_PER_RULE) {
    return `signals length must be ≤ ${MAX_SIGNALS_PER_RULE}`;
  }
  if (!isRiskBand(rule.thresholdBand)) return `unknown thresholdBand: ${rule.thresholdBand}`;
  if (!isRiskAction(rule.action)) return `unknown action: ${rule.action}`;
  for (const s of rule.signals) {
    const err = validateSignal(s);
    if (err) return `signal ${s.kind}: ${err}`;
  }
  return null;
}

/** Validate a policy. */
export function validatePolicy(p: IRiskPolicy): string | null {
  if (!p.id) return 'id required';
  if (!p.orgId) return 'orgId required';
  if (!isRiskAction(p.defaultAction)) return `unknown defaultAction: ${p.defaultAction}`;
  if (p.rules.length > MAX_RULES_PER_POLICY) {
    return `rules length must be ≤ ${MAX_RULES_PER_POLICY}`;
  }
  for (const r of p.rules) {
    const err = validateRule(r);
    if (err) return `rule ${r.name}: ${err}`;
  }
  return null;
}

/** Normalize a policy. */
export function normalizePolicy(input: {
  id: string;
  orgId: string;
  defaultAction?: RiskAction;
  auditAll?: boolean;
  now?: string;
}): IRiskPolicy {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    orgId: input.orgId,
    defaultAction: input.defaultAction ?? 'allow',
    rules: [],
    auditAll: input.auditAll ?? true,
    updatedAt: nowIso,
  };
}

/** Sum weights from a list of signals. */
export function totalWeight(signals: IRiskSignal[]): number {
  return signals.reduce((acc, s) => acc + Math.max(0, Math.min(MAX_WEIGHT, s.weight)), 0);
}

/** Decide whether a rule fires for a signal batch. */
export function ruleFires(
  rule: IRiskRule,
  signals: IRiskSignal[]
): {
  fires: boolean;
  score: number;
  firedSignals: IRiskSignal[];
} {
  const matched = signals.filter((s) => rule.signals.some((rs) => rs.kind === s.kind));
  const score = totalWeight(matched);
  const fires =
    matched.length > 0 && bandRank(bandFromScore(score)) >= bandRank(rule.thresholdBand);
  return { fires, score, firedSignals: fires ? matched : [] };
}

/** Convert band to numeric rank for ordering. */
function bandRank(b: RiskBand): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[b];
}

/** Evaluate a policy against a signal batch and produce a decision. */
export function evaluate(input: {
  policy: IRiskPolicy;
  signals: IRiskSignal[];
  actorId: string;
  exempt?: boolean;
  now?: string;
}): IRiskDecision {
  const nowIso = input.now ?? new Date().toISOString();
  const { totalScore, fired, action } = runRules(input);
  const band = bandFromScore(totalScore);
  const finalAction = maxAction(action, actionForBand(band));
  return {
    id: `dec-${input.actorId}-${Date.now()}`,
    orgId: input.policy.orgId,
    actorId: input.actorId,
    score: totalScore,
    band,
    action: finalAction,
    firedRules: fired,
    detail: fired.length === 0 ? 'no rule fired' : `${fired.length} rule(s) fired`,
    createdAt: nowIso,
  };
}

function runRules(input: {
  policy: IRiskPolicy;
  signals: IRiskSignal[];
  actorId: string;
  exempt?: boolean;
}): {
  totalScore: number;
  fired: { ruleId: string; signal: RiskSignalKind; detail: string }[];
  action: RiskAction;
} {
  let totalScore = 0;
  const fired: { ruleId: string; signal: RiskSignalKind; detail: string }[] = [];
  let action: RiskAction = input.policy.defaultAction;
  for (const rule of input.policy.rules) {
    if (!rule.enabled) continue;
    if (input.exempt && rule.exemptActorIds.includes(input.actorId)) continue;
    const result = ruleFires(rule, input.signals);
    if (!result.fires) continue;
    totalScore += result.score;
    action = maxAction(action, rule.action);
    for (const sig of result.firedSignals) {
      fired.push({ ruleId: rule.id, signal: sig.kind, detail: sig.detail });
    }
  }
  return { totalScore, fired, action };
}

function maxAction(a: RiskAction, b: RiskAction): RiskAction {
  return rankAction(a) >= rankAction(b) ? a : b;
}

/** Test if a decision should be persisted to audit (mirror policy.auditAll or hard-block). */
export function shouldAudit(decision: IRiskDecision, policy: IRiskPolicy): boolean {
  return policy.auditAll || decision.action === 'hard-block';
}

function rankAction(a: RiskAction): number {
  const order: RiskAction[] = ['allow', 'challenge', 'soft-block', 'hard-block'];
  return order.indexOf(a);
}

function actionForBand(band: RiskBand): RiskAction {
  if (band === 'critical') return 'hard-block';
  if (band === 'high') return 'soft-block';
  if (band === 'medium') return 'challenge';
  return 'allow';
}
