/**
 * OpenAPI merge — pure helpers (Stage 104).
 */

import { validateOperation, buildDocument } from '../openapi-metadata/openapi-metadata.service';
import { crudVerbToHttp } from '../e2e-routes-smoke/e2e-routes-smoke.service';
import type { IControllerSpec, IRouteSpec } from '../controller-factory/controller-factory.types';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';
import type {
  IOpenApiMergeInput,
  IOpenApiMergeResult,
  IControllerSpecToOpsInput,
  MergeConflictPolicy,
} from './openapi-merge.types';
import { MAX_MERGE_INPUTS, MAX_MERGE_OUTPUT_OPS } from './openapi-merge.types';

/** Validate a merge input. */
export function validateMergeInput(input: IOpenApiMergeInput): string | null {
  if (!Array.isArray(input.docs)) return 'docs must be array';
  if (input.docs.length === 0) return 'docs required';
  if (input.docs.length > MAX_MERGE_INPUTS) return `docs cap ${MAX_MERGE_INPUTS}`;
  const policy = input.conflictPolicy ?? 'skip';
  if (!['skip', 'overwrite', 'error'].includes(policy)) return `unknown policy: ${policy}`;
  return null;
}

/** Convert a single controller spec to a list of operations. */
export function controllerSpecToOperations(
  input: IControllerSpecToOpsInput
): IOperationSpec[] {
  return input.controller.routes.map((r) =>
    controllerRouteToOperation({
      resource: input.controller.resource,
      route: r,
      stubSchemas: input.stubSchemas ?? true,
    })
  );
}

/** Convert a (resource, route) tuple to a single IOperationSpec. */
export function controllerRouteToOperation(input: {
  resource: string;
  route: IRouteSpec;
  stubSchemas: boolean;
}): IOperationSpec {
  const verb = crudVerbToHttp(input.route.verb);
  const path = `/${input.resource}${input.route.path === '/' ? '' : input.route.path}`;
  const summary = `${input.route.verb} ${input.resource}`;
  return {
    operationId: `${input.resource}.${input.route.operationId}`,
    resource: input.resource,
    verb,
    path,
    summary,
    authRequired: input.route.authRequired,
    params: pathParamsFromTemplate(path),
    responses: [
      {
        status: 200,
        schema: input.stubSchemas ? `${input.resource}.Result` : 'Result',
      },
    ],
  };
}

/** Extract `:param` placeholders from a path. */
export function pathParamsFromTemplate(path: string): Array<{
  name: string;
  in: 'path';
  required: boolean;
  type: 'string';
}> {
  const out: Array<{ name: string; in: 'path'; required: boolean; type: 'string' }> = [];
  const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    out.push({ name: m[1]!, in: 'path', required: true, type: 'string' });
  }
  return out;
}

/** Merge multiple documents into one. */
export function mergeOpenApiDocuments(input: IOpenApiMergeInput): IOpenApiMergeResult {
  const err = validateMergeInput(input);
  if (err) throw new Error(`invalid merge input: ${err}`);
  const policy: MergeConflictPolicy = input.conflictPolicy ?? 'skip';
  const seen = new Map<string, IOperationSpec>();
  const conflicts: Array<{ operationId: string; policy: MergeConflictPolicy }> = [];
  let skipped = 0;
  let invalid = 0;
  let added = 0;

  for (const doc of input.docs) {
    for (const op of doc.operations) {
      const verr = validateOperation(op);
      if (verr) {
        invalid++;
        continue;
      }
      const existing = seen.get(op.operationId);
      if (existing) {
        conflicts.push({ operationId: op.operationId, policy });
        if (policy === 'skip') {
          skipped++;
          continue;
        }
        if (policy === 'error') {
          throw new Error(`conflict on operationId ${op.operationId}`);
        }
        // overwrite
        seen.set(op.operationId, op);
        added++;
        continue;
      }
      seen.set(op.operationId, op);
      added++;
    }
    // Merge schemas too (overwrite).
  }
  const ops = Array.from(seen.values()).slice(0, MAX_MERGE_OUTPUT_OPS);
  const title = input.title ?? input.docs[0]!.title;
  const version = input.version ?? input.docs[0]!.version;
  const schemas: Record<string, string> = {};
  for (const d of input.docs) {
    for (const [k, v] of Object.entries(d.schemas)) schemas[k] = v;
  }
  const doc = buildDocument({ title, version, operations: ops, schemas });
  return { doc, added, skipped, invalid, conflicts };
}

/** Find an operation across multiple documents. */
export function findAcross(input: {
  docs: ReadonlyArray<IOpenApiDocument>;
  operationId: string;
}): { doc: IOpenApiDocument; op: IOperationSpec } | null {
  for (const d of input.docs) {
    const op = d.operations.find((o) => o.operationId === input.operationId);
    if (op) return { doc: d, op };
  }
  return null;
}

/** List operationIds across all docs (deduped). */
export function listOperationIds(input: {
  docs: ReadonlyArray<IOpenApiDocument>;
}): string[] {
  const set = new Set<string>();
  for (const d of input.docs) {
    for (const op of d.operations) set.add(op.operationId);
  }
  return [...set].sort();
}

/** Count merged schemas. */
export function countSchemas(input: {
  docs: ReadonlyArray<IOpenApiDocument>;
}): number {
  const set = new Set<string>();
  for (const d of input.docs) {
    for (const k of Object.keys(d.schemas)) set.add(k);
  }
  return set.size;
}

/** Whether a docs list has duplicates by operationId. */
export function hasDuplicates(input: {
  docs: ReadonlyArray<IOpenApiDocument>;
}): boolean {
  const ids = listOperationIds({ docs: input.docs });
  let total = 0;
  for (const d of input.docs) total += d.operations.length;
  return total !== ids.length;
}
