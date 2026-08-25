/**
 * TOTP 2FA types — Stage 22.
 *
 * RFC 6238 + RFC 4226 minimum subset. We do not implement HOTP or
 * token enrollment for arbitrary primitives; everything goes through
 * authenticator apps that already understand the otpauth URL format.
 */

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface ITotpFactorRow {
  id: string;
  userId: string;
  label: string;
  secret: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
  lastCounter: bigint;
  enabled: boolean;
}

export interface ITotpEnrollmentChallenge {
  /** Persisted before verify. Used to bind the verify step to the enrollment. */
  factorId: string;
  /** otpauth:// URI to render as QR (we never base64 a QR ourselves). */
  otpauthUri: string;
  /** Plaintext base32 secret — shown once, not recoverable. */
  secret: string;
  /** Single-use recovery codes shown once at enrollment. */
  backupCodes: string[];
}

export interface ITotpVerifyInput {
  userId: string;
  /** 6 (or 8) digit code from the user's authenticator app. */
  code: string;
  /** Optional backup code; when set, consumed on the matching factor. */
  backupCode?: string;
}

export interface ITotpVerifyResult {
  ok: boolean;
  /** Which factor accepted the code (so callers can mark it as the default). */
  factorId?: string;
  /** True when the input was a backup code (used to alert the user to rotate). */
  consumedBackupCode?: boolean;
  /** Remaining unused backup codes after consumption (for UI warnings). */
  remainingBackupCodes?: number;
  /** Counter advances after a successful accept; surfaces on rate-limited retries. */
  nextAllowedAt?: number;
}
