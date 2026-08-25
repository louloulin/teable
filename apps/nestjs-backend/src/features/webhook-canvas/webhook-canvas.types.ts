/**
 * Webhook Canvas — types (Stage 110).
 *
 * Visual canvas for outbound webhook delivery chains.
 * Nodes: source / transform / url / retry / dead_letter
 * Edges: directed data flow.
 */

export type WebhookNodeKind = 'source' | 'transform' | 'url' | 'retry' | 'dead_letter';

export interface WebhookNodeSpec {
  id: string;
  kind: WebhookNodeKind;
  /** Subtype, e.g. 'pick_fields', 'sign_hmac', 'http_post'. */
  ref: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  disabled?: boolean;
}

export interface WebhookEdgeSpec {
  id: string;
  from: string;
  to: string;
}

export interface WebhookCanvasSpec {
  id: string;
  name: string;
  version: 1;
  nodes: WebhookNodeSpec[];
  edges: WebhookEdgeSpec[];
}

export type WebhookValidationCode =
  | 'ok'
  | 'duplicate_node_id'
  | 'unknown_node_ref'
  | 'edge_references_missing_node'
  | 'cycle_detected'
  | 'no_url_terminal'
  | 'too_many_nodes'
  | 'too_many_edges';

export interface WebhookValidationIssue {
  code: WebhookValidationCode;
  target?: string;
  message: string;
}

export interface WebhookValidationResult {
  ok: boolean;
  issues: WebhookValidationIssue[];
}

export interface WebhookExecutionStep {
  index: number;
  nodeId: string;
  kind: WebhookNodeKind;
  ref: string;
  downstream: string[];
}

export interface WebhookExecutionPlan {
  canvasId: string;
  steps: WebhookExecutionStep[];
  linear: boolean;
}

export const MAX_WEBHOOK_CANVAS_NODES = 128;
export const MAX_WEBHOOK_CANVAS_EDGES = 512;
export const WEBHOOK_NODE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;