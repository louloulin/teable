/**
 * SDK Code Generator (JS/TS) — types (Stage 117).
 *
 * Generates a typed TypeScript SDK from an OpenAPI document.
 */

export interface OpenApiOperation {
  operationId: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary?: string;
  tags?: readonly string[];
  parameters?: readonly OpenApiParameter[];
  requestBody?: { schemaRef: string; required: boolean };
  responseSchemaRef?: string;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  type: 'string' | 'number' | 'boolean';
  required: boolean;
}

export interface OpenApiSchema {
  ref: string;
  tsType: string;
  required: readonly string[];
  properties: ReadonlyArray<{ name: string; tsType: string; optional: boolean }>;
}

export interface OpenApiDocument {
  title: string;
  version: string;
  servers: readonly string[];
  operations: readonly OpenApiOperation[];
  schemas: readonly OpenApiSchema[];
}

export interface GeneratedSdkFile {
  path: string;
  content: string;
}

export interface SdkCodegenResult {
  packageName: string;
  version: string;
  files: readonly GeneratedSdkFile[];
  entrypoint: string;
}

export const SDK_JS_DEFAULT_PACKAGE_NAME = '@teable/sdk';
export const SDK_JS_DEFAULT_VERSION = '0.1.0';