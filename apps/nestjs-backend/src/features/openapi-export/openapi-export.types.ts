/**
 * OpenAPI export — types (Stage 103).
 */

export interface IOpenApiExportTarget {
  /** Logical name (e.g. "teable", "stripe-bridge"). */
  name: string;
  /** Path where the JSON file should be written. */
  path: string;
  /** Whether the target is enabled (false → skip). */
  enabled: boolean;
}

export interface ISerializedDocument {
  /** Raw JSON-serialized payload (string). */
  json: string;
  /** Pretty-printed variant (string). */
  pretty: string;
  /** Number of operations in the source document. */
  operations: number;
  /** Number of schemas in the source document. */
  schemas: number;
  /** Size of the pretty payload in bytes (utf-8). */
  bytes: number;
}

export interface IExportPlan {
  target: IOpenApiExportTarget;
  operations: number;
  schemas: number;
  bytes: number;
}

export const MAX_EXPORT_TARGETS = 16;
export const MAX_DOC_BYTES = 8 * 1024 * 1024;
