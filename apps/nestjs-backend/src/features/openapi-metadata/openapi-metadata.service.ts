/**
 * OpenAPI metadata — pure helpers (Stage 93).
 */

import type {
  IOperationSpec,
  IOpenApiDocument,
  IParamSpec,
} from './openapi-metadata.types';
import {
  MAX_OPERATIONS,
  MAX_PARAMS_PER_OPERATION,
  MAX_RESPONSES_PER_OPERATION,
  MAX_SCHEMAS,
} from './openapi-metadata.types';

const VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PARAM_LOCATIONS = new Set(['path', 'query', 'header', 'cookie']);
const PARAM_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array']);

/** Validate a single operation. */
export function validateOperation(op: IOperationSpec): string | null {
  if (!op.operationId) return 'operationId required';
  if (!VERBS.has(op.verb)) return `unknown verb: ${op.verb}`;
  if (!op.path || !op.path.startsWith('/')) return 'path must start with /';
  if (op.params.length > MAX_PARAMS_PER_OPERATION) return `params cap ${MAX_PARAMS_PER_OPERATION}`;
  if (op.responses.length > MAX_RESPONSES_PER_OPERATION) return `responses cap ${MAX_RESPONSES_PER_OPERATION}`;
  for (const p of op.params) {
    const err = validateParam(p);
    if (err) return `param ${p.name}: ${err}`;
  }
  for (const r of op.responses) {
    if (r.status < 100 || r.status > 599) return `bad status: ${r.status}`;
  }
  return null;
}

/** Validate a parameter spec. */
export function validateParam(p: IParamSpec): string | null {
  if (!p.name) return 'name required';
  if (!PARAM_LOCATIONS.has(p.in)) return `unknown location: ${p.in}`;
  if (!PARAM_TYPES.has(p.type)) return `unknown type: ${p.type}`;
  return null;
}

/** Aggregate operations into a document. */
export function buildDocument(input: {
  title: string;
  version: string;
  operations: ReadonlyArray<IOperationSpec>;
  schemas?: Record<string, string>;
}): IOpenApiDocument {
  const ops = input.operations.slice(0, MAX_OPERATIONS);
  for (const op of ops) {
    const err = validateOperation(op);
    if (err) throw new Error(`invalid op ${op.operationId}: ${err}`);
  }
  const schemas: Record<string, string> = {};
  const seed = input.schemas ?? {};
  const keys = Object.keys(seed).slice(0, MAX_SCHEMAS);
  for (const k of keys) {
    schemas[k] = seed[k]!;
  }
  return {
    title: input.title,
    version: input.version,
    operations: [...ops],
    schemas,
  };
}

/** Filter operations by HTTP verb. */
export function filterByVerb(input: {
  doc: IOpenApiDocument;
  verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}): IOperationSpec[] {
  return input.doc.operations.filter((o) => o.verb === input.verb);
}

/** Filter operations by auth requirement. */
export function filterByAuth(input: {
  doc: IOpenApiDocument;
  authRequired: boolean;
}): IOperationSpec[] {
  return input.doc.operations.filter((o) => o.authRequired === input.authRequired);
}

/** Find an operation by id. */
export function findOperation(input: {
  doc: IOpenApiDocument;
  operationId: string;
}): IOperationSpec | null {
  return input.doc.operations.find((o) => o.operationId === input.operationId) ?? null;
}

/** Count operations per verb. */
export function countsByVerb(doc: IOpenApiDocument): Record<string, number> {
  const out: Record<string, number> = { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
  for (const o of doc.operations) out[o.verb] = (out[o.verb] ?? 0) + 1;
  return out;
}

/** List unique resource names. */
export function uniqueResources(doc: IOpenApiDocument): string[] {
  const seen = new Set<string>();
  for (const o of doc.operations) seen.add(o.resource);
  return [...seen].sort();
}

/** Merge two documents — operations appended, schemas merged. */
export function mergeDocuments(a: IOpenApiDocument, b: IOpenApiDocument): IOpenApiDocument {
  return buildDocument({
    title: a.title,
    version: a.version,
    operations: [...a.operations, ...b.operations],
    schemas: { ...a.schemas, ...b.schemas },
  });
}