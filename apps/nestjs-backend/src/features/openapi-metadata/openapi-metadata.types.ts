/**
 * OpenAPI metadata — types (Stage 93).
 */

export type ParamLocation = 'path' | 'query' | 'header' | 'cookie';

export interface IParamSpec {
  name: string;
  in: ParamLocation;
  required: boolean;
  description?: string;
  /** Schema name reference. */
  type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
}

export interface IRequestBodySpec {
  /** Schema name reference. */
  schema: string;
  required: boolean;
  contentType: string;
}

export interface IResponseSpec {
  /** Status code (e.g. 200). */
  status: number;
  /** Schema name reference. */
  schema: string;
}

export interface IOperationSpec {
  /** Stable identifier — matches controller-factory IRouteSpec.operationId. */
  operationId: string;
  /** Resource name (controller-factory resource). */
  resource: string;
  /** HTTP verb in upper-case. */
  verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Full URL path with `:id` placeholders. */
  path: string;
  /** Short summary shown in explorer. */
  summary: string;
  /** Whether the route requires authentication. */
  authRequired: boolean;
  params: IParamSpec[];
  body?: IRequestBodySpec;
  responses: IResponseSpec[];
}

export interface IOpenApiDocument {
  /** Title displayed at the top of the explorer. */
  title: string;
  /** API version string. */
  version: string;
  operations: IOperationSpec[];
  schemas: Record<string, string>;
}

export const MAX_OPERATIONS = 512;
export const MAX_PARAMS_PER_OPERATION = 16;
export const MAX_RESPONSES_PER_OPERATION = 8;
export const MAX_SCHEMAS = 128;