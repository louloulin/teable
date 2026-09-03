/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Stripe Customer Portal session helpers (R56).
 *
 * Pure helpers for building + parsing Stripe Customer Portal sessions.
 * These are extracted from `BillingPortalController.stripePortal()` so
 * the request/response shape is testable without a real Stripe account.
 *
 * Flow:
 *   buildPortalSessionRequest({ customerId, returnUrl })
 *     -> { url, method, headers, body }
 *   POST that to Stripe -> raw JSON response
 *   parsePortalSessionResponse(raw)
 *     -> { sessionId, url } or throws on error
 *
 * `validatePortalReturnUrl(url)` is a defensive SSRF / open-redirect
 * guard: only https URLs to a public host (no loopback / metadata).
 *
 * License: AGPL-3.0
 */

export interface IBuildPortalRequestInput {
  /** Stripe customer id (cus_*). */
  customerId: string;
  /** URL the user is sent back to after closing the portal. */
  returnUrl: string;
  /** Optional Stripe API base (override for testing). */
  apiBase?: string;
}

export interface IStripeHttpRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface IStripePortalSession {
  /** Stripe session id (bps_*). */
  sessionId: string;
  /** URL the browser should be redirected to. */
  url: string;
}

/** Default Stripe API base; overridable for tests. */
export const DEFAULT_STRIPE_API_BASE = 'https://api.stripe.com/v1/billing_portal/sessions';

/** Default Stripe portal endpoint. */
export const STRIPE_PORTAL_PATH = '/v1/billing_portal/sessions';

export class PortalValidationError extends Error {
  constructor(message: string) {
    super(`portal validation error: ${message}`);
    (this as Error & { code: string }).code = 'PORTAL_VALIDATION';
  }
}

/**
 * Validate the return_url. Defends against:
 *   - non-https schemes (http, javascript:, data:, file:, etc.)
 *   - loopback / metadata IPs (even if hostname looks legitimate)
 *   - missing or malformed URLs
 *
 * Returns the parsed URL on success; throws PortalValidationError otherwise.
 */
export function validatePortalReturnUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PortalValidationError(`returnUrl is not a valid URL: ${input}`);
  }
  if (url.protocol !== 'https:') {
    throw new PortalValidationError(`returnUrl must use https (got ${url.protocol})`);
  }
  if (!url.hostname || url.hostname.length === 0) {
    throw new PortalValidationError('returnUrl has no hostname');
  }
  const lowerHost = url.hostname.toLowerCase();
  const blockedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    'metadata.google.internal',
    '169.254.169.254',
  ]);
  if (blockedHosts.has(lowerHost)) {
    throw new PortalValidationError(`returnUrl points at loopback/metadata: ${lowerHost}`);
  }
  return url;
}

/** Validate the Stripe customer id. cus_* format only. */
export function validateCustomerId(customerId: string): void {
  if (!customerId || typeof customerId !== 'string') {
    throw new PortalValidationError('customerId is required');
  }
  if (!/^cus_[A-Za-z0-9]{8,}$/.test(customerId)) {
    throw new PortalValidationError(`customerId format invalid: ${customerId}`);
  }
}

/**
 * Build the HTTP request envelope Stripe expects for creating a portal
 * session. Application/x-www-form-urlencoded with `customer` and
 * `return_url` fields. Bearer auth header is left to the caller.
 */
export function buildPortalSessionRequest(input: IBuildPortalRequestInput): IStripeHttpRequest {
  validateCustomerId(input.customerId);
  validatePortalReturnUrl(input.returnUrl);
  const apiBase = input.apiBase ?? DEFAULT_STRIPE_API_BASE;
  const params = new URLSearchParams();
  params.append('customer', input.customerId);
  params.append('return_url', input.returnUrl);
  return {
    url: apiBase,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Authorization header is set by the caller (so they can choose
      // between stripe-secret-key, oauth, or a test stub).
      'Stripe-Version': '2024-06-20',
    },
    body: params.toString(),
  };
}

/** Parse the Stripe response into a typed portal session. Throws on error. */
export function parsePortalSessionResponse(raw: unknown): IStripePortalSession {
  if (!raw || typeof raw !== 'object') {
    throw new PortalValidationError('portal session response is not an object');
  }
  const obj = raw as Record<string, unknown>;
  const sessionId = obj['id'];
  const url = obj['url'];
  if (typeof sessionId !== 'string' || !sessionId.startsWith('bps_')) {
    throw new PortalValidationError(`portal session id format invalid: ${String(sessionId)}`);
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new PortalValidationError(`portal session url must be https: ${String(url)}`);
  }
  return { sessionId, url };
}

/**
 * Compose a portal session end-to-end: build request -> dispatch via
 * injectable `fetchImpl` -> parse response. Throws on any failure.
 *
 * Used by both the controller (with real Stripe fetch) and tests
 * (with stubbed fetch).
 */
export interface IPortalFetchLike {
  (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    status: number;
    text(): Promise<string>;
  }>;
}

export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
  secretKey: string;
  fetchImpl?: IPortalFetchLike;
  apiBase?: string;
}): Promise<IStripePortalSession> {
  const fetchImpl: IPortalFetchLike =
    input.fetchImpl ??
    ((url, init) =>
      fetch(url, init) as unknown as ReturnType<IPortalFetchLike>);
  const req = buildPortalSessionRequest({
    customerId: input.customerId,
    returnUrl: input.returnUrl,
    ...(input.apiBase ? { apiBase: input.apiBase } : {}),
  });
  const headers = { ...req.headers, Authorization: `Bearer ${input.secretKey}` };
  const res = await fetchImpl(req.url, { method: req.method, headers, body: req.body });
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new PortalValidationError(`stripe portal error ${res.status}: ${text}`);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PortalValidationError(`stripe portal response is not JSON: ${text.slice(0, 200)}`);
  }
  return parsePortalSessionResponse(parsed);
}
