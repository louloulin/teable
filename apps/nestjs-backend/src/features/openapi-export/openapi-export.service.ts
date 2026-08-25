/**
 * OpenAPI export — pure helpers (Stage 103).
 */

import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';
import type {
  IExportPlan,
  IOpenApiExportTarget,
  ISerializedDocument,
} from './openapi-export.types';
import { MAX_DOC_BYTES, MAX_EXPORT_TARGETS } from './openapi-export.types';

/** Build a path-safe slug from the target name. */
export function buildExportPath(input: { name: string; root: string }): string {
  const safe = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const root = input.root.endsWith('/') ? input.root.slice(0, -1) : input.root;
  return `${root}/${safe}.openapi.json`;
}

/** Validate a target. */
export function validateTarget(t: IOpenApiExportTarget): string | null {
  if (!t.name) return 'name required';
  if (!t.path) return 'path required';
  if (!t.path.startsWith('/')) return 'path must be absolute';
  if (typeof t.enabled !== 'boolean') return 'enabled required';
  return null;
}

/** Validate the document shape (basic structural checks). */
export function validateShape(doc: IOpenApiDocument): string | null {
  if (!doc) return 'document required';
  if (!doc.title) return 'title required';
  if (!doc.version) return 'version required';
  if (!Array.isArray(doc.operations)) return 'operations must be array';
  if (typeof doc.schemas !== 'object' || doc.schemas === null) {
    return 'schemas must be object';
  }
  return null;
}

/** Serialize an IOpenApiDocument into compact + pretty JSON. */
export function serializeDocument(doc: IOpenApiDocument): ISerializedDocument {
  const err = validateShape(doc);
  if (err) throw new Error(`invalid document: ${err}`);
  const json = JSON.stringify(doc);
  const pretty = JSON.stringify(doc, null, 2);
  const bytes = Buffer.byteLength(pretty, 'utf-8');
  if (bytes > MAX_DOC_BYTES) {
    throw new Error(`document too large: ${bytes} bytes (cap ${MAX_DOC_BYTES})`);
  }
  return {
    json,
    pretty,
    operations: doc.operations.length,
    schemas: Object.keys(doc.schemas).length,
    bytes,
  };
}

/** Build an export plan describing what would be written. */
export function planExport(input: {
  doc: IOpenApiDocument;
  target: IOpenApiExportTarget;
}): IExportPlan {
  const err = validateTarget(input.target);
  if (err) throw new Error(`invalid target: ${err}`);
  const ser = serializeDocument(input.doc);
  return {
    target: input.target,
    operations: ser.operations,
    schemas: ser.schemas,
    bytes: ser.bytes,
  };
}

/** Cap a list of targets. */
export function capTargets(targets: ReadonlyArray<IOpenApiExportTarget>): IOpenApiExportTarget[] {
  if (targets.length <= MAX_EXPORT_TARGETS) return targets.slice();
  return targets.slice(0, MAX_EXPORT_TARGETS);
}

/** Filter to enabled targets. */
export function enabledTargets(
  targets: ReadonlyArray<IOpenApiExportTarget>
): IOpenApiExportTarget[] {
  return targets.filter((t) => t.enabled);
}

/** Resolve target name collisions deterministically. */
export function resolveCollision(input: {
  existing: ReadonlyArray<string>;
  candidate: string;
}): string {
  if (!input.existing.includes(input.candidate)) return input.candidate;
  let i = 2;
  while (input.existing.includes(`${input.candidate}-${i}`)) i++;
  return `${input.candidate}-${i}`;
}

/** Sanitize a JSON payload to ensure parseable. */
export function parsePayload(raw: string): IOpenApiDocument | null {
  try {
    const parsed = JSON.parse(raw) as IOpenApiDocument;
    if (validateShape(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build a default export target for a doc. */
export function defaultTargetFor(input: {
  doc: IOpenApiDocument;
  root: string;
}): IOpenApiExportTarget {
  const slug = (input.doc.title || 'api').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return {
    name: slug,
    path: buildExportPath({ name: slug, root: input.root }),
    enabled: true,
  };
}
