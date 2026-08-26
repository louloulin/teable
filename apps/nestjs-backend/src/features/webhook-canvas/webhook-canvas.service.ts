/**
 * Webhook Canvas — pure helpers (Stage 110).
 */

import {
  MAX_WEBHOOK_CANVAS_EDGES,
  MAX_WEBHOOK_CANVAS_NODES,
  WEBHOOK_NODE_ID_RE,
  WebhookCanvasSpec,
  WebhookEdgeSpec,
  WebhookExecutionPlan,
  WebhookExecutionStep,
  WebhookNodeKind,
  WebhookNodeSpec,
  WebhookValidationIssue,
  WebhookValidationResult,
} from './webhook-canvas.types';

const KNOWN_REFS = new Set([
  'pick_fields',
  'sign_hmac',
  'add_headers',
  'http_post',
  'http_put',
  'retry_block',
  'dead_letter_queue',
  'event_source',
]);

function resolveRef(
  kind: WebhookNodeKind,
  ref: string,
  catalog?: Record<string, readonly string[]>
): boolean {
  if (!ref) return false;
  if (catalog) {
    const allowed = catalog[kind];
    return Array.isArray(allowed) && allowed.includes(ref);
  }
  return KNOWN_REFS.has(ref);
}

/** Validate canvas. */
export function validateWebhookCanvas(
  canvas: WebhookCanvasSpec,
  catalog?: Record<string, readonly string[]>
): WebhookValidationResult {
  const issues: WebhookValidationIssue[] = [];
  if (!canvas || canvas.version !== 1) {
    issues.push({ code: 'unknown_node_ref', message: 'unsupported version' });
    return { ok: false, issues };
  }
  if (canvas.nodes.length > MAX_WEBHOOK_CANVAS_NODES) {
    issues.push({
      code: 'too_many_nodes',
      message: `nodes ${canvas.nodes.length} > ${MAX_WEBHOOK_CANVAS_NODES}`,
    });
  }
  if (canvas.edges.length > MAX_WEBHOOK_CANVAS_EDGES) {
    issues.push({
      code: 'too_many_edges',
      message: `edges ${canvas.edges.length} > ${MAX_WEBHOOK_CANVAS_EDGES}`,
    });
  }
  const ids = new Set<string>();
  for (const n of canvas.nodes) {
    if (!WEBHOOK_NODE_ID_RE.test(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `invalid id: ${n.id}` });
    } else if (ids.has(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `duplicate id: ${n.id}` });
    } else {
      ids.add(n.id);
    }
    if (!resolveRef(n.kind, n.ref, catalog)) {
      issues.push({
        code: 'unknown_node_ref',
        target: n.id,
        message: `unknown ${n.kind} ref: ${n.ref}`,
      });
    }
  }
  for (const e of canvas.edges) {
    if (!ids.has(e.from))
      issues.push({
        code: 'edge_references_missing_node',
        target: e.id,
        message: `from ${e.from}`,
      });
    if (!ids.has(e.to))
      issues.push({ code: 'edge_references_missing_node', target: e.id, message: `to ${e.to}` });
  }
  // Cycle detection via Kahn.
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of canvas.nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of canvas.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of canvas.nodes) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id);
  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited.size !== canvas.nodes.length) {
    issues.push({
      code: 'cycle_detected',
      message: `cycle: ${visited.size}/${canvas.nodes.length}`,
    });
  }
  // Need at least one terminal url node reachable from source.
  if (!canvas.nodes.some((n) => n.kind === 'url')) {
    issues.push({ code: 'no_url_terminal', message: 'no url node' });
  }
  return { ok: issues.length === 0, issues };
}

/** Topological sort. */
export function topoSortWebhook(canvas: WebhookCanvasSpec): string[] {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of canvas.nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of canvas.edges) {
    if (!adj.has(e.from) || !indeg.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of canvas.nodes) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id);
  const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}

/** Plan execution. */
export function planWebhookExecution(canvas: WebhookCanvasSpec): WebhookExecutionPlan {
  const v = validateWebhookCanvas(canvas);
  const linear = v.ok;
  const order = linear ? topoSortWebhook(canvas) : [];
  const downstream = new Map<string, string[]>();
  for (const e of canvas.edges) {
    const list = downstream.get(e.from) ?? [];
    list.push(e.to);
    downstream.set(e.from, list);
  }
  const byId = new Map(canvas.nodes.map((n) => [n.id, n] as const));
  const steps: WebhookExecutionStep[] = order
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .map((n, idx) => ({
      index: idx,
      nodeId: n.id,
      kind: n.kind,
      ref: n.ref,
      downstream: downstream.get(n.id) ?? [],
    }));
  return { canvasId: canvas.id, steps, linear };
}

/** Add a node (idempotent). */
export function addWebhookNode(
  canvas: WebhookCanvasSpec,
  node: WebhookNodeSpec
): WebhookCanvasSpec {
  if (canvas.nodes.some((n) => n.id === node.id)) return canvas;
  return { ...canvas, nodes: [...canvas.nodes, node] };
}

/** Remove a node. */
export function removeWebhookNode(canvas: WebhookCanvasSpec, nodeId: string): WebhookCanvasSpec {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => n.id !== nodeId),
    edges: canvas.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

/** Add an edge. */
export function addWebhookEdge(
  canvas: WebhookCanvasSpec,
  edge: WebhookEdgeSpec
): WebhookCanvasSpec {
  if (canvas.edges.some((e) => e.from === edge.from && e.to === edge.to)) return canvas;
  return { ...canvas, edges: [...canvas.edges, edge] };
}

/** Remove edge. */
export function removeWebhookEdge(canvas: WebhookCanvasSpec, edgeId: string): WebhookCanvasSpec {
  return { ...canvas, edges: canvas.edges.filter((e) => e.id !== edgeId) };
}

/** Move node. */
export function moveWebhookNode(
  canvas: WebhookCanvasSpec,
  id: string,
  position: { x: number; y: number }
): WebhookCanvasSpec {
  return { ...canvas, nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, position } : n)) };
}

/** Serialize deterministically. */
export function serializeWebhookCanvas(canvas: WebhookCanvasSpec): string {
  return JSON.stringify(canvas);
}

/** Summarize. */
export function summarizeWebhookCanvas(canvas: WebhookCanvasSpec): {
  nodes: number;
  edges: number;
  urls: number;
  transforms: number;
} {
  return {
    nodes: canvas.nodes.length,
    edges: canvas.edges.length,
    urls: canvas.nodes.filter((n) => n.kind === 'url').length,
    transforms: canvas.nodes.filter((n) => n.kind === 'transform').length,
  };
}

/** Group nodes by kind. */
export function groupWebhookNodesByKind(
  canvas: WebhookCanvasSpec
): Record<string, WebhookNodeSpec[]> {
  const out: Record<string, WebhookNodeSpec[]> = {};
  for (const n of canvas.nodes) (out[n.kind] ??= []).push(n);
  return out;
}
