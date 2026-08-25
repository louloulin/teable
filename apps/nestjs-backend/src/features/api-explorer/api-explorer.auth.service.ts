/**
 * API Explorer — auth layer (Stage 58).
 *
 * Wires the pure helpers to a route catalogue. The route catalogue is
 * provided via dependency injection so test doubles can replace it
 * without scanning the entire NestJS application.
 */

import { Injectable } from '@nestjs/common';

import { buildExplorerHtml, buildOpenApiSpec, serializeSpec } from './api-explorer.service';
import type { IBuildHtmlInput, IBuildSpecInput } from './api-explorer.service';
import { IApiExplorerOptions } from './api-explorer.types';
import type { IOpenApiSpec, IRouteSpec } from './api-explorer.types';

export interface IRouteCatalog {
  listRoutes(): Promise<ReadonlyArray<IRouteSpec>>;
}

@Injectable()
export class ApiExplorerAuthService {
  constructor(
    private readonly catalog: IRouteCatalog,
    private readonly defaults: IApiExplorerOptions
  ) {}

  async getOpenApiJson(): Promise<{ contentType: string; body: string }> {
    const spec = await this.buildSpec();
    return { contentType: 'application/json', body: serializeSpec(spec) };
  }

  async getExplorerHtml(): Promise<{ contentType: string; body: string }> {
    const spec = await this.buildSpec();
    const html = buildExplorerHtml({ spec, options: this.defaults });
    return { contentType: 'text/html; charset=utf-8', body: html };
  }

  /** Convenience for tests / consumers that want the parsed spec object. */
  async getSpec(): Promise<IOpenApiSpec> {
    return this.buildSpec();
  }

  private async buildSpec(): Promise<IOpenApiSpec> {
    const routes = await this.catalog.listRoutes();
    const input: IBuildSpecInput = { routes, options: this.defaults };
    return buildOpenApiSpec(input);
  }
}

/** Bundled Teable OSS catalogue — exposed for direct invocation in tests
 * and for the default NestJS route. Keep entries alphabetised by path. */
export const DEFAULT_TEABLE_ROUTES: ReadonlyArray<IRouteSpec> = [
  {
    operationId: 'base.list',
    method: 'GET',
    path: '/api/base',
    summary: 'List spaces (a.k.a. bases) the user can access',
    tags: ['base'],
    parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }],
  },
  {
    operationId: 'table.list',
    method: 'GET',
    path: '/api/base/{baseId}/table',
    summary: 'List tables in a base',
    tags: ['table'],
    parameters: [{ name: 'baseId', in: 'path', required: true, schema: { type: 'string' } }],
  },
  {
    operationId: 'table.create',
    method: 'POST',
    path: '/api/base/{baseId}/table',
    summary: 'Create a new table',
    tags: ['table'],
    parameters: [{ name: 'baseId', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      name: 'body',
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    operationId: 'record.list',
    method: 'GET',
    path: '/api/table/{tableId}/record',
    summary: 'List records in a table',
    tags: ['record'],
    parameters: [
      { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'take', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'skip', in: 'query', required: false, schema: { type: 'integer' } },
    ],
  },
  {
    operationId: 'view.list',
    method: 'GET',
    path: '/api/table/{tableId}/view',
    summary: 'List views in a table',
    tags: ['view'],
    parameters: [{ name: 'tableId', in: 'path', required: true, schema: { type: 'string' } }],
  },
  {
    operationId: 'automation.list',
    method: 'GET',
    path: '/api/base/{baseId}/automation',
    summary: 'List automation rules in a base',
    tags: ['automation'],
    parameters: [{ name: 'baseId', in: 'path', required: true, schema: { type: 'string' } }],
  },
];

/** Default catalog backed by the in-memory `DEFAULT_TEABLE_ROUTES` list. */
@Injectable()
export class InMemoryRouteCatalog implements IRouteCatalog {
  async listRoutes(): Promise<ReadonlyArray<IRouteSpec>> {
    return DEFAULT_TEABLE_ROUTES;
  }
}
