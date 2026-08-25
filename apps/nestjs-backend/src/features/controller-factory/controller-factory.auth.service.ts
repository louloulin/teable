/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Controller factory — NestJS auth service (Stage 91).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendController,
  authedRoutes,
  buildRouteTable,
  findRoute,
  totalRoutes,
  validateController,
} from './controller-factory.service';
import type {
  IControllerSpec,
  IRouteSpec,
  IRouteTable,
} from './controller-factory.types';

@Injectable()
export class ControllerFactoryAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert a controller spec. */
  async upsertController(input: { controller: IControllerSpec }): Promise<IControllerSpec> {
    const err = validateController(input.controller);
    if (err) throw new Error(err);
    await this.prisma.controllerSpec.upsert({
      where: { id: input.controller.resource },
      create: {
        id: input.controller.resource,
        resource: input.controller.resource,
        routes: input.controller.routes as object,
      },
      update: {
        routes: input.controller.routes as object,
      },
    });
    return input.controller;
  }

  /** Load the full route table. */
  async loadRouteTable(): Promise<IRouteTable> {
    const rows = await this.prisma.controllerSpec.findMany();
    const controllers = rows.map(rowToController);
    return buildRouteTable({ controllers });
  }

  /** Append a controller to the persisted table. */
  async appendController(input: { controller: IControllerSpec }): Promise<IRouteTable> {
    const current = await this.loadRouteTable();
    const next = appendController({ table: current, controller: input.controller });
    await this.upsertController({ controller: input.controller });
    return next;
  }

  /** Find a route by resource + operationId. */
  async findRoute(input: { resource: string; operationId: string }): Promise<IRouteSpec | null> {
    const table = await this.loadRouteTable();
    return findRoute({ table, resource: input.resource, operationId: input.operationId });
  }

  /** Total routes persisted. */
  async totalRoutes(): Promise<number> {
    const table = await this.loadRouteTable();
    return totalRoutes(table);
  }

  /** List auth-required routes across all controllers. */
  async authedRoutes(): Promise<IRouteSpec[]> {
    const table = await this.loadRouteTable();
    return authedRoutes(table);
  }
}

function rowToController(r: Record<string, unknown>): IControllerSpec {
  return {
    resource: String(r['resource']),
    routes: (r['routes'] as IRouteSpec[]) ?? [],
  };
}
