/* eslint-disable @typescript-eslint/naming-convention */
/**
 * OpenAPI metadata — NestJS auth service (Stage 93).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildDocument,
  countsByVerb,
  filterByAuth,
  filterByVerb,
  findOperation,
  uniqueResources,
  validateOperation,
} from './openapi-metadata.service';
import type {
  IOpenApiDocument,
  IOperationSpec,
} from './openapi-metadata.types';

@Injectable()
export class OpenApiMetadataAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert an operation spec. */
  async upsertOperation(input: { operation: IOperationSpec }): Promise<IOperationSpec> {
    const err = validateOperation(input.operation);
    if (err) throw new Error(err);
    await this.prisma.openApiOperation.upsert({
      where: { id: input.operation.operationId },
      create: {
        id: input.operation.operationId,
        operationId: input.operation.operationId,
        resource: input.operation.resource,
        verb: input.operation.verb,
        path: input.operation.path,
        summary: input.operation.summary,
        authRequired: input.operation.authRequired,
        params: input.operation.params as object,
        body: (input.operation.body as object) ?? Prisma.JsonNull,
        responses: input.operation.responses as object,
      },
      update: {
        resource: input.operation.resource,
        verb: input.operation.verb,
        path: input.operation.path,
        summary: input.operation.summary,
        authRequired: input.operation.authRequired,
        params: input.operation.params as object,
        body: (input.operation.body as object) ?? Prisma.JsonNull,
        responses: input.operation.responses as object,
      },
    });
    return input.operation;
  }

  /** Load all operations into a document. */
  async loadDocument(input: { title: string; version: string }): Promise<IOpenApiDocument> {
    const rows = await this.prisma.openApiOperation.findMany();
    const ops = rows.map(rowToOperation);
    return buildDocument({
      title: input.title,
      version: input.version,
      operations: ops,
    });
  }

  /** Filter operations by verb (persisted). */
  async filterByVerb(input: {
    title: string;
    version: string;
    verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  }): Promise<IOperationSpec[]> {
    const doc = await this.loadDocument({ title: input.title, version: input.version });
    return filterByVerb({ doc, verb: input.verb });
  }

  /** Filter operations by auth requirement. */
  async filterByAuth(input: {
    title: string;
    version: string;
    authRequired: boolean;
  }): Promise<IOperationSpec[]> {
    const doc = await this.loadDocument({ title: input.title, version: input.version });
    return filterByAuth({ doc, authRequired: input.authRequired });
  }

  /** Find an operation by id. */
  async findOperation(input: {
    title: string;
    version: string;
    operationId: string;
  }): Promise<IOperationSpec | null> {
    const doc = await this.loadDocument({ title: input.title, version: input.version });
    return findOperation({ doc, operationId: input.operationId });
  }

  /** Aggregated counts. */
  async verbCounts(input: { title: string; version: string }): Promise<Record<string, number>> {
    const doc = await this.loadDocument({ title: input.title, version: input.version });
    return countsByVerb(doc);
  }

  /** Distinct resource names. */
  async resources(input: { title: string; version: string }): Promise<string[]> {
    const doc = await this.loadDocument({ title: input.title, version: input.version });
    return uniqueResources(doc);
  }
}

function rowToOperation(r: Record<string, unknown>): IOperationSpec {
  return {
    operationId: String(r['operationId']),
    resource: String(r['resource']),
    verb: r['verb'] as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: String(r['path']),
    summary: String(r['summary']),
    authRequired: Boolean(r['authRequired']),
    params: (r['params'] as IOperationSpec['params']) ?? [],
    body: r['body'] as IOperationSpec['body'],
    responses: (r['responses'] as IOperationSpec['responses']) ?? [],
  };
}

// Provide a minimal Prisma.JsonNull-like reference without importing prisma client here.
const Prisma = { JsonNull: null as unknown as object };