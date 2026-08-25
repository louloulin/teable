/**
 * OpenAPI merge — NestJS auth service (Stage 104).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  controllerSpecToOperations,
  countSchemas,
  findAcross,
  hasDuplicates,
  listOperationIds,
  mergeOpenApiDocuments,
  pathParamsFromTemplate,
  validateMergeInput,
} from './openapi-merge.service';
import type {
  IOpenApiMergeInput,
  IOpenApiMergeResult,
} from './openapi-merge.types';
import type { IControllerSpec } from '../controller-factory/controller-factory.types';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';

@Injectable()
export class OpenApiMergeAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Convert a controller spec to operations (used by Stage 91 → Stage 93 merge). */
  controllerToOps(input: { controller: IControllerSpec }) {
    return controllerSpecToOperations(input);
  }

  /** Extract `:param` from a path. */
  pathParams(path: string) {
    return pathParamsFromTemplate(path);
  }

  /** Merge documents. */
  merge(input: IOpenApiMergeInput): IOpenApiMergeResult {
    return mergeOpenApiDocuments(input);
  }

  /** Find an operation across docs. */
  findAcross(input: {
    docs: ReadonlyArray<IOpenApiDocument>;
    operationId: string;
  }) {
    return findAcross(input);
  }

  /** List operationIds across docs (deduped, sorted). */
  listOpIds(input: { docs: ReadonlyArray<IOpenApiDocument> }): string[] {
    return listOperationIds(input);
  }

  /** Count unique schemas. */
  schemaCount(input: { docs: ReadonlyArray<IOpenApiDocument> }): number {
    return countSchemas(input);
  }

  /** Whether docs contain duplicate operationIds. */
  dupes(input: { docs: ReadonlyArray<IOpenApiDocument> }): boolean {
    return hasDuplicates(input);
  }

  /** Validate merge input. */
  validate(input: IOpenApiMergeInput): string | null {
    return validateMergeInput(input);
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
