/**
 * Main bootstrap — pure helpers (Stage 97).
 */

import type {
  IBootstrapInput,
  IBootstrapPlan,
  IBootstrapStep,
  IShutdownSignal,
  LifecycleState,
} from './main-bootstrap.types';
import { DEFAULT_PORT, DEFAULT_SHUTDOWN_TIMEOUT_MS, MAX_STEPS } from './main-bootstrap.types';

/** Validate bootstrap input. */
export function validateBootstrapInput(input: IBootstrapInput): string | null {
  if (!input.appName) return 'appName required';
  if (!input.version) return 'version required';
  if (typeof input.port !== 'number' || input.port <= 0 || input.port > 65535) {
    return 'port out of range';
  }
  if (input.shutdownTimeoutMs < 1000) return 'shutdownTimeoutMs too low';
  return null;
}

/** Build the initial plan. */
export function buildPlan(input: {
  config: IBootstrapInput;
  steps: ReadonlyArray<IBootstrapStep>;
}): IBootstrapPlan {
  const err = validateBootstrapInput(input.config);
  if (err) throw new Error(err);
  return {
    appName: input.config.appName,
    version: input.config.version,
    port: input.config.port,
    shutdownTimeoutMs: input.config.shutdownTimeoutMs,
    steps: input.steps.slice(0, MAX_STEPS),
    state: 'init',
  };
}

/** Transition the plan to a new state. */
export function transition(input: {
  plan: IBootstrapPlan;
  to: LifecycleState;
}): IBootstrapPlan {
  if (!isValidTransition(input.plan.state, input.to)) {
    throw new Error(`invalid transition: ${input.plan.state} -> ${input.to}`);
  }
  return { ...input.plan, state: input.to };
}

/** Decide whether a transition is allowed. */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  const allowed: Record<LifecycleState, ReadonlyArray<LifecycleState>> = {
    init: ['starting'],
    starting: ['ready', 'errored'],
    ready: ['shutting_down'],
    shutting_down: ['stopped', 'errored'],
    stopped: [],
    errored: ['shutting_down', 'stopped'],
  };
  return allowed[from].includes(to);
}

/** Build a default plan for typical backend boot. */
export function defaultPlan(input: Partial<IBootstrapInput> = {}): IBootstrapPlan {
  return buildPlan({
    config: {
      appName: input.appName ?? 'teable-backend',
      version: input.version ?? '0.0.0',
      port: input.port ?? DEFAULT_PORT,
      shutdownTimeoutMs: input.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    },
    steps: [
      { name: 'load-config', required: true },
      { name: 'connect-prisma', required: true },
      { name: 'mount-modules', required: true },
      { name: 'start-http', required: true },
    ],
  });
}

/** Record a shutdown signal. */
export function recordShutdown(input: { signal: 'SIGTERM' | 'SIGINT' | 'manual'; now: string }): IShutdownSignal {
  return { signal: input.signal, receivedAt: input.now };
}

/** Number of required steps in a plan. */
export function requiredStepCount(plan: IBootstrapPlan): number {
  return plan.steps.filter((s) => s.required).length;
}

/** Whether the plan is in a "stopped" final state. */
export function isStopped(state: LifecycleState): boolean {
  return state === 'stopped' || state === 'errored';
}

/** Apply a shutdown signal to the plan. */
export function applyShutdown(input: {
  plan: IBootstrapPlan;
  signal: IShutdownSignal;
}): IBootstrapPlan {
  return transition({ plan: input.plan, to: 'shutting_down' });
}

/** Check if a step has completed by name. */
export function isStepCompleted(input: { steps: ReadonlyArray<IBootstrapStep>; name: string }): boolean {
  return input.steps.some((s) => s.name === input.name);
}