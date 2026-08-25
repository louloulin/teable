/**
 * Env config — types (Stage 96).
 */

export type EnvKind = 'string' | 'number' | 'boolean' | 'enum';

export interface IEnvSpec {
  /** Env var name, e.g. PRISMA_DATABASE_URL. */
  name: string;
  /** Whether the var is required to start the app. */
  required: boolean;
  /** Value kind — drives parser. */
  kind: EnvKind;
  /** Default value when optional. */
  default?: string | number | boolean;
  /** Allowed enum values — required when kind === 'enum'. */
  enumValues?: string[];
  /** Description for the docs / startup banner. */
  description?: string;
}

export interface IEnvReport {
  valid: boolean;
  issues: string[];
  /** Effective env map (resolved defaults + parsed kinds). */
  values: Record<string, string | number | boolean>;
}

export const MAX_ENV_SPECS = 128;
export const MAX_ENV_VALUE_LENGTH = 4096;