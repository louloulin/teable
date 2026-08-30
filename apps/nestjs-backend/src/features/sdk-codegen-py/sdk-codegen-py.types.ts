/**
 * SDK Code Generator (Python) — types (Stage 118).
 */

export interface OpenApiOperationPy {
  operationId: string;
  method: string;
  path: string;
  tags?: ReadonlyArray<string>;
  parameters?: ReadonlyArray<{ name: string; in: string; type: string; required: boolean }>;
  requestBody?: { schemaRef: string; required: boolean };
  responseSchemaRef?: string;
}

export interface OpenApiSchemaPy {
  ref: string;
  pyType: string;
  required: ReadonlyArray<string>;
  properties: ReadonlyArray<{ name: string; pyType: string; optional: boolean }>;
}

export interface OpenApiDocumentPy {
  title: string;
  version: string;
  servers: ReadonlyArray<string>;
  operations: ReadonlyArray<OpenApiOperationPy>;
  schemas: ReadonlyArray<OpenApiSchemaPy>;
}

export interface GeneratedPyFile {
  path: string;
  content: string;
}

export interface PyCodegenResult {
  packageName: string;
  version: string;
  files: ReadonlyArray<GeneratedPyFile>;
  entrypoint: string;
}

export const SDK_PY_DEFAULT_PACKAGE = 'teable_sdk';
export const SDK_PY_DEFAULT_VERSION = '0.1.0';
export const SDK_PY_MIN_PYTHON = '3.9';
