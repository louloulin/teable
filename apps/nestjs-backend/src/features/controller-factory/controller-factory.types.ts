/**
 * Controller factory — types (Stage 91).
 */

export type CrudVerb = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom';

export interface IRouteSpec {
  /** Path under the controller base, e.g. `:id`. May be `/` for the index route. */
  path: string;
  /** HTTP verb. */
  verb: CrudVerb;
  /** Operation identifier — used for OpenAPI / logs. */
  operationId: string;
  /** Whether the route requires authentication. */
  authRequired: boolean;
  /** Rate limit group name (interceptor in Stage 92 will look this up). */
  rateLimitGroup?: string;
}

export interface IControllerSpec {
  /** Resource name (path segment), e.g. `risk-policies`. */
  resource: string;
  /** Routes under the controller. */
  routes: IRouteSpec[];
}

export interface IRouteTable {
  /** Resource → routes. */
  controllers: IControllerSpec[];
}

export const MAX_CONTROLLERS = 64;
export const MAX_ROUTES_PER_CONTROLLER = 32;
