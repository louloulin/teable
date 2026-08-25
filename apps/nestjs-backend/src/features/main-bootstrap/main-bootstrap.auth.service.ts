/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Main bootstrap — NestJS auth service (Stage 97).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyShutdown,
  buildPlan,
  defaultPlan,
  isStopped,
  recordShutdown,
  requiredStepCount,
  transition,
} from './main-bootstrap.service';
import type {
  IBootstrapInput,
  IBootstrapPlan,
  IShutdownSignal,
  LifecycleState,
} from './main-bootstrap.types';

@Injectable()
export class MainBootstrapAuthService {
  private currentPlan: IBootstrapPlan | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Initialize the bootstrap plan. */
  initialize(input: Partial<IBootstrapInput> = {}): IBootstrapPlan {
    const plan = defaultPlan(input);
    this.currentPlan = plan;
    return plan;
  }

  /** Get the current plan. */
  getPlan(): IBootstrapPlan | null {
    return this.currentPlan;
  }

  /** Transition state — throws if invalid. */
  setState(input: { to: LifecycleState }): IBootstrapPlan {
    if (!this.currentPlan) throw new Error('bootstrap not initialized');
    this.currentPlan = transition({ plan: this.currentPlan, to: input.to });
    return this.currentPlan;
  }

  /** Record a shutdown signal and transition to shutting_down. */
  shutdown(input: { signal: 'SIGTERM' | 'SIGINT' | 'manual'; now: string }): {
    signal: IShutdownSignal;
    plan: IBootstrapPlan;
  } {
    if (!this.currentPlan) throw new Error('bootstrap not initialized');
    const signal = recordShutdown(input);
    this.currentPlan = applyShutdown({ plan: this.currentPlan, signal });
    return { signal, plan: this.currentPlan };
  }

  /** Whether the app is in a terminal state. */
  isStopped(): boolean {
    return this.currentPlan ? isStopped(this.currentPlan.state) : true;
  }

  /** Required step count. */
  requiredStepCount(): number {
    return this.currentPlan ? requiredStepCount(this.currentPlan) : 0;
  }

  /** Build a plan from full input (alternative to default). */
  build(input: { config: IBootstrapInput; steps: IBootstrapPlan['steps'] }): IBootstrapPlan {
    const plan = buildPlan(input);
    this.currentPlan = plan;
    return plan;
  }

  /** Reset — for tests. */
  reset(): void {
    this.currentPlan = null;
  }

  /** Health snapshot — used by health-controller (Stage 98). */
  snapshot(): {
    appName: string;
    version: string;
    state: LifecycleState;
    port: number;
  } | null {
    if (!this.currentPlan) return null;
    return {
      appName: this.currentPlan.appName,
      version: this.currentPlan.version,
      state: this.currentPlan.state,
      port: this.currentPlan.port,
    };
  }
}