/**
 * Compliance Control Map — types (Stage 122).
 *
 * SOC2 / ISO27001 control framework with evidence mapping.
 */

export type ControlFramework = 'SOC2' | 'ISO27001';

export type ControlCategory =
  | 'access_control'
  | 'logging'
  | 'change_mgmt'
  | 'encryption'
  | 'incident_response'
  | 'vendor_mgmt'
  | 'business_continuity'
  | 'data_integrity';

export type ControlStatus = 'not_started' | 'in_progress' | 'attested' | 'verified' | 'failed';

export interface ControlItem {
  /** Unique control id (e.g. `SOC2-CC6.1`, `ISO-A.9.1`). */
  id: string;
  /** Framework this control belongs to. */
  framework: ControlFramework;
  /** Category. */
  category: ControlCategory;
  /** Display title. */
  title: string;
  /** Plain-language description. */
  description: string;
  /** Required evidence kind(s). */
  evidence: readonly EvidenceKind[];
  /** Current status. */
  status: ControlStatus;
  /** ISO date when status last changed. */
  updatedAt?: string;
}

export type EvidenceKind =
  | 'query_log'
  | 'change_log'
  | 'access_review'
  | 'incident_log'
  | 'policy_doc'
  | 'config_snapshot'
  | 'test_result'
  | 'attestation';

export interface EvidenceRequirement {
  controlId: string;
  kind: EvidenceKind;
  /** Whether this evidence is required for the control to be attested. */
  required: boolean;
  /** Suggested collection cadence. */
  cadence: 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
}

export interface ControlMapEntry {
  control: ControlItem;
  requirements: readonly EvidenceRequirement[];
}

export interface ControlCoverageReport {
  total: number;
  attested: number;
  verified: number;
  failed: number;
  missing: ReadonlyArray<{ controlId: string; missing: readonly EvidenceKind[] }>;
}

export const CONTROL_ID_RE = /^(SOC2-CC[0-9]+\.[0-9]+|ISO-A\.[0-9]+\.[0-9]+)$/;