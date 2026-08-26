/**
 * Bidirectional webhook bridge — Stage 62.
 *
 * Stage 53 owns out-bound webhook delivery (Teable → external). Stage 62
 * adds the inverse direction: external systems POST events into Teable,
 * we authenticate + verify the payload + normalise it, and route the
 * resulting event into automation (Stage 13) or webhook-delivery
 * (Stage 53).
 */

export type BridgeDirection = 'inbound' | 'outbound' | 'both';

export type BridgeAuthScheme = 'hmac-sha256' | 'bearer' | 'basic' | 'none';

export interface IBridgeAuthConfig {
  scheme: BridgeAuthScheme;
  /** HMAC secret / bearer token — the value is never logged. */
  secret?: string;
  /** HTTP header carrying the signature. */
  headerName?: string;
  /** Optional query parameter that must be present (e.g. webhook_id). */
  queryParam?: string;
}

export interface IWebhookBridge {
  id: string;
  baseId: string;
  name: string;
  direction: BridgeDirection;
  auth: IBridgeAuthConfig;
  /** Default target within Teable: 'automation' routes into Stage 13, 'webhook' routes out via Stage 53. */
  target: 'automation' | 'webhook' | 'noop';
  /** Optional event-type filter; when present, only matching events are routed. */
  eventTypes?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IInboundEnvelope {
  bridgeId: string;
  /** Verbatim body the bridge received. */
  rawBody: string;
  headers: Record<string, string>;
  /** Optional query string (pre-decoded). */
  query?: Record<string, string>;
  /** Wall-clock receive time. */
  receivedAt: string;
}

export type AuthFailureReason =
  | 'missing-header'
  | 'missing-secret'
  | 'bad-signature'
  | 'missing-query-param'
  | 'unknown-scheme';

export interface IAuthResult {
  ok: boolean;
  reason?: AuthFailureReason;
  /** When the bridge uses a query param, the matched value is echoed back. */
  matched?: string;
}

export interface IRoutedEvent {
  id: string;
  bridgeId: string;
  baseId: string;
  eventType: string;
  /** Normalised payload (JSON-parsed + signature-verified). */
  payload: Record<string, unknown>;
  target: IWebhookBridge['target'];
  receivedAt: string;
}

/** The shape of the in-process message we hand to automation / delivery. */
export interface IBridgeDispatch {
  envelope: IRoutedEvent;
  /** Optional pre-built signature so downstream delivery can replay it. */
  downstream?: {
    targetUrl: string;
    headers?: Record<string, string>;
  };
}
