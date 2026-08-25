/**
 * OpenAPI merge — types (Stage 104).
 */

import type { IControllerSpec, IRouteSpec } from '../controller-factory/controller-factory.types';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';

export type MergeConflictPolicy = 'skip' | 'overwrite' | 'error';

export interface IOpenApiMergeInput {
  /** Source documents to merge. */
  docs: ReadonlyArray<IOpenApiDocument>;
  /** How to handle operationId conflicts. */
  conflictPolicy?: MergeConflictPolicy;
  /** Title for the merged document (defaults to first doc's title). */
  title?: string;
  /** Version for the merged document (defaults to first doc's version). */
  version?: string;
}

export interface IOpenApiMergeResult {
  doc: IOpenApiDocument;
  /** Operations added from sources (after conflict resolution). */
  added: number;
  /** Operations skipped (conflictPolicy = 'skip'). */
  skipped: number;
  /** Operations that failed validation. */
  invalid: number;
  /** Conflict details. */
  conflicts: Array<{ operationId: string; policy: MergeConflictPolicy }>;
}

export interface IControllerSpecToOpsInput {
  controller: IControllerSpec;
  /** When true, also produce schema stubs for the resource. */
  stubSchemas?: boolean;
}

export const MAX_MERGE_INPUTS = 16;
export const MAX_MERGE_OUTPUT_OPS = 1024;
