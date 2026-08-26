/**
 * Domain-verification — thin-DI wrapper types (Stage 130).
 */

export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'revoked';

export interface IVerificationSummary {
  domain: string;
  status: VerificationStatus;
  /** Token the operator must publish as a TXT record. */
  token: string | null;
  /** Wall-clock of the most recent DNS poll. */
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface IParsedTxtRecord {
  /** Joined TXT chunks (one logical record may span multiple strings). */
  value: string;
  /** Verbatim quoted representation, if input was quoted. */
  quoted: boolean;
}