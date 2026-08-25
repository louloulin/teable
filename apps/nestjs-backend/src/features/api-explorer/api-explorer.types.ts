/* eslint-disable @typescript-eslint/naming-convention */
/**
 * API Explorer / OpenAPI docs — Stage 58.
 *
 * Self-contained OpenAPI 3.1 emitter + interactive HTML explorer.
 * The pure helpers turn a list of `IRouteSpec` entries into a JSON spec
 * and a self-contained HTML page (no external CDN, no Swagger UI).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ParamLocation = 'path' | 'query' | 'header' | 'body';

export interface IRouteParam {
  name: string;
  in: ParamLocation;
  required?: boolean;
  description?: string;
  schema?: IJsonSchema;
}

export interface IRouteResponse {
  status: string;
  description?: string;
  schema?: IJsonSchema;
}

export interface IRouteSpec {
  /** Stable operation id, e.g. "table.list". */
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: IRouteParam[];
  requestBody?: IRouteParam;
  responses?: IRouteResponse[];
  /** When true, route requires a valid access token. */
  requiresAuth?: boolean;
}

/** Minimal JSON Schema subset used in route specs. */
export interface IJsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  format?: string;
  enum?: ReadonlyArray<string | number>;
  items?: IJsonSchema;
  properties?: Record<string, IJsonSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
}

export interface IOpenApiSpec {
  openapi: '3.1.0';
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, Partial<Record<Lowercase<HttpMethod>, IOperationObject>>>;
  components?: {
    securitySchemes?: Record<string, ISecurityScheme>;
    schemas?: Record<string, IJsonSchema>;
  };
}

export interface IOperationObject {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: IRouteParam[];
  requestBody?: { required?: boolean; content: { 'application/json': { schema: IJsonSchema } } };
  responses: Record<
    string,
    { description?: string; content?: { 'application/json': { schema: IJsonSchema } } }
  >;
  security?: Array<Record<string, string[]>>;
}

export interface ISecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2';
  scheme?: 'bearer' | 'basic';
  bearerFormat?: string;
  in?: 'header' | 'query';
  name?: string;
  flows?: unknown;
}

export interface IApiExplorerOptions {
  title: string;
  version: string;
  description?: string;
  /** Default server URL advertised in the spec. */
  baseUrl?: string;
  /** Toggle auth requirement on the explorer try-it-out form. */
  requireAuthByDefault?: boolean;
}
