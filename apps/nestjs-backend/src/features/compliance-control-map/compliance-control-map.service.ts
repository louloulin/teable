/**
 * Compliance Control Map — pure helpers (Stage 122).
 */

import {
  ControlCoverageReport,
  ControlFramework,
  ControlItem,
  ControlMapEntry,
  ControlStatus,
  EvidenceKind,
  EvidenceRequirement,
} from './compliance-control-map.types';

/** Built-in SOC2 + ISO27001 control library (common subset). */
export const BUILTIN_CONTROLS: readonly ControlItem[] = [
  // SOC2 — CC6 Logical access
  { id: 'SOC2-CC6.1', framework: 'SOC2', category: 'access_control', title: 'Logical access controls', description: 'Restrict logical access to information assets.', evidence: ['access_review', 'query_log'], status: 'not_started' },
  { id: 'SOC2-CC6.2', framework: 'SOC2', category: 'access_control', title: 'New user authorization', description: 'Authorize new users before granting access.', evidence: ['access_review'], status: 'not_started' },
  { id: 'SOC2-CC6.6', framework: 'SOC2', category: 'access_control', title: 'External boundary protection', description: 'Implement logical access security measures at the boundary.', evidence: ['config_snapshot', 'policy_doc'], status: 'not_started' },
  // SOC2 — CC7 System operations
  { id: 'SOC2-CC7.1', framework: 'SOC2', category: 'logging', title: 'Detection of anomalies', description: 'Detect anomalies and act on them.', evidence: ['query_log', 'incident_log'], status: 'not_started' },
  { id: 'SOC2-CC7.2', framework: 'SOC2', category: 'logging', title: 'Monitoring of changes', description: 'Monitor system components for anomalies.', evidence: ['change_log', 'test_result'], status: 'not_started' },
  // SOC2 — CC8 Change management
  { id: 'SOC2-CC8.1', framework: 'SOC2', category: 'change_mgmt', title: 'Change management process', description: 'Authorize and track changes to infrastructure and software.', evidence: ['change_log', 'policy_doc'], status: 'not_started' },
  // ISO27001 — A.9 Access control
  { id: 'ISO-A.9.1', framework: 'ISO27001', category: 'access_control', title: 'Access control policy', description: 'Define and enforce access control policy.', evidence: ['policy_doc', 'access_review'], status: 'not_started' },
  { id: 'ISO-A.9.4', framework: 'ISO27001', category: 'access_control', title: 'System and application access control', description: 'Restrict access to systems and applications.', evidence: ['access_review', 'config_snapshot'], status: 'not_started' },
  // ISO27001 — A.12 Operations security
  { id: 'ISO-A.12.1', framework: 'ISO27001', category: 'logging', title: 'Operational procedures and responsibilities', description: 'Document and follow operational procedures.', evidence: ['policy_doc'], status: 'not_started' },
  { id: 'ISO-A.12.4', framework: 'ISO27001', category: 'logging', title: 'Logging and monitoring', description: 'Record events and monitor systems.', evidence: ['query_log', 'incident_log'], status: 'not_started' },
  // ISO27001 — A.16 Incident management
  { id: 'ISO-A.16.1', framework: 'ISO27001', category: 'incident_response', title: 'Reporting information security events', description: 'Report and respond to incidents.', evidence: ['incident_log', 'policy_doc'], status: 'not_started' },
];

/** Derive evidence requirements from a control. */
export function requirementsFor(control: ControlItem, cadenceByKind: Partial<Record<EvidenceKind, EvidenceRequirement['cadence']>> = {}): readonly EvidenceRequirement[] {
  return control.evidence.map((kind) => ({
    controlId: control.id,
    kind,
    required: kind !== 'test_result',
    cadence: cadenceByKind[kind] ?? defaultCadence(control.category),
  }));
}

function defaultCadence(category: import('./compliance-control-map.types').ControlCategory): EvidenceRequirement['cadence'] {
  if (category === 'logging' || category === 'access_control') return 'continuous';
  if (category === 'incident_response') return 'monthly';
  return 'quarterly';
}

/** Build a control map. */
export function buildControlMap(extra: readonly ControlItem[] = []): readonly ControlMapEntry[] {
  const all = [...BUILTIN_CONTROLS, ...extra];
  return all.map((control) => ({ control, requirements: requirementsFor(control) }));
}

/** Filter by framework. */
export function filterByFramework(entries: readonly ControlMapEntry[], framework: ControlFramework): readonly ControlMapEntry[] {
  return entries.filter((e) => e.control.framework === framework);
}

/** Filter by category. */
export function filterByCategory(entries: readonly ControlMapEntry[], category: import('./compliance-control-map.types').ControlCategory): readonly ControlMapEntry[] {
  return entries.filter((e) => e.control.category === category);
}

/** Update a control's status. */
export function updateStatus(control: ControlItem, status: ControlStatus, updatedAt: string): ControlItem {
  return { ...control, status, updatedAt };
}

/** Check whether a control id matches the canonical regex. */
export function isControlIdValid(id: string): boolean {
  return /^(SOC2-CC[0-9]+\.[0-9]+|ISO-A\.[0-9]+\.[0-9]+)$/.test(id);
}

/** Find entries missing evidence kinds (passed in via `hasEvidence` set). */
export function findMissingEvidence(entries: readonly ControlMapEntry[], hasEvidence: ReadonlyMap<string, Set<EvidenceKind>>): ControlCoverageReport {
  const missing: Array<{ controlId: string; missing: readonly EvidenceKind[] }> = [];
  let attested = 0;
  let verified = 0;
  let failed = 0;
  for (const e of entries) {
    if (e.control.status === 'attested') attested++;
    if (e.control.status === 'verified') verified++;
    if (e.control.status === 'failed') failed++;
    const got = hasEvidence.get(e.control.id) ?? new Set();
    const miss = e.control.evidence.filter((k) => !got.has(k));
    if (miss.length > 0) missing.push({ controlId: e.control.id, missing: miss });
  }
  return { total: entries.length, attested, verified, failed, missing };
}

/** Coverage percent. */
export function coveragePercent(report: ControlCoverageReport): number {
  if (report.total === 0) return 100;
  return Math.round(((report.attested + report.verified) / report.total) * 100);
}

/** Serialize deterministically. */
export function serializeMap(entries: readonly ControlMapEntry[]): string {
  return JSON.stringify(entries.map((e) => ({ id: e.control.id, status: e.control.status, requirements: e.requirements })));
}

/** Hash for optimistic concurrency. */
export function hashMap(entries: readonly ControlMapEntry[]): string {
  return hashStr(serializeMap(entries));
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).padStart(8, '0');
}