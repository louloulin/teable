/**
 * Main bootstrap — types (Stage 97).
 */

export type LifecycleState =
  | 'init'
  | 'starting'
  | 'ready'
  | 'shutting_down'
  | 'stopped'
  | 'errored';

export interface IBootstrapInput {
  /** Name of the app, used in logs. */
  appName: string;
  /** Version string surfaced by /api/health/version. */
  version: string;
  /** Port to bind (used by /api/health/ready). */
  port: number;
  /** Maximum shutdown wait (ms). */
  shutdownTimeoutMs: number;
}

export interface IBootstrapStep {
  /** Step id — order matters. */
  name: string;
  /** Whether the step is required. */
  required: boolean;
}

export interface IBootstrapPlan {
  appName: string;
  version: string;
  port: number;
  shutdownTimeoutMs: number;
  steps: IBootstrapStep[];
  state: LifecycleState;
}

export interface IShutdownSignal {
  signal: 'SIGTERM' | 'SIGINT' | 'manual';
  receivedAt: string;
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
export const MAX_STEPS = 32;