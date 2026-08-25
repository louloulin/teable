/**
 * E2E routes smoke — NestJS auth service (Stage 101).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  authedRoutes,
  buildRouteTable,
} from '../controller-factory/controller-factory.service';
import type { IRouteSpec, IRouteTable } from '../controller-factory/controller-factory.types';
import { ControllerFactoryAuthService } from '../controller-factory/controller-factory.auth.service';
import {
  capCases,
  coversAuthedRoutes,
  expandControllerToCases,
  failures,
  passRate,
  runRouteSmoke,
} from './e2e-routes-smoke.service';
import type {
  IRouteSmokeCase,
  IRouteSmokeReport,
  ISmokeInvoker,
} from './e2e-routes-smoke.types';

@Injectable()
export class E2eRoutesSmokeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controllerFactory: ControllerFactoryAuthService
  ) {}

  /** Load the route table from the wired controller factory. */
  async loadTable(): Promise<IRouteTable> {
    return this.controllerFactory.loadRouteTable();
  }

  /** Expand controllers into cases, capped. */
  async buildCases(input: {
    resources?: ReadonlyArray<string>;
    token?: string;
  } = {}): Promise<IRouteSmokeCase[]> {
    const table = await this.loadTable();
    const wanted = input.resources && input.resources.length > 0
      ? new Set(input.resources)
      : null;
    let cases: IRouteSmokeCase[] = [];
    for (const c of table.controllers) {
      if (wanted && !wanted.has(c.resource)) continue;
      cases = cases.concat(
        expandControllerToCases({ controller: c, token: input.token })
      );
    }
    return capCases(cases);
  }

  /** Run the smoke against the provided invoker (typically the test harness). */
  async smoke(input: {
    invoker: ISmokeInvoker;
    cases?: ReadonlyArray<IRouteSmokeCase>;
    resources?: ReadonlyArray<string>;
    token?: string;
  }): Promise<IRouteSmokeReport> {
    const table = await this.loadTable();
    const cases = input.cases ?? (await this.buildCases({
      resources: input.resources,
      token: input.token,
    }));
    return runRouteSmoke({ table, cases, invoker: input.invoker });
  }

  /** Coverage: did the cases exercise every authed route? */
  async coversAuthedRoutes(input: {
    cases: ReadonlyArray<IRouteSmokeCase>;
  }): Promise<boolean> {
    const table = await this.loadTable();
    return coversAuthedRoutes({ table, cases: input.cases });
  }

  /** List authed routes from the wired table. */
  async authedRoutes(): Promise<IRouteSpec[]> {
    const table = await this.loadTable();
    return authedRoutes(table);
  }

  /** List failures from a report. */
  reportFailures(report: IRouteSmokeReport) {
    return failures(report);
  }

  /** Pass rate from a report. */
  reportPassRate(report: IRouteSmokeReport): number {
    return passRate(report);
  }

  /** Health probe. */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
