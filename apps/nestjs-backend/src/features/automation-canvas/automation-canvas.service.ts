/**
 * Automation Canvas — pure helpers (Stage 107).
 *
 * Pure graph utilities over `CanvasGraphSpec`. No Prisma, no NestJS.
 * Round 22 / Stage 107.
 */

import {
  CANVAS_NODE_ID_RE,
  CanvasGraphSpec,
  CanvasExecutionPlan,
  CanvasExecutionStep,
  CanvasEdgeSpec,
  CanvasNodeSpec,
  CanvasValidationIssue,
  CanvasValidationResult,
  MAX_CANVAS_EDGES,
  MAX_CANVAS_NODES,
} from './automation-canvas.types';

/** Well-known trigger/action refs (validated when caller passes a catalog). */
const KNOWN_TRIGGER_REFS = new Set([
  'record_created',
  'record_updated',
  'record_deleted',
  'schedule',
  'webhook_inbound',
  'manual',
]);

const KNOWN_ACTION_REFS = new Set([
  'update_record',
  'send_email',
  'call_webhook',
  'notify_user',
  'ai_prompt',
]);

const KNOWN_CONDITION_REFS = new Set([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
]);

/** Resolve `ref` against the optional catalog (or fall back to built-ins). */
export function resolveNodeRef(
  kind: CanvasNodeSpec['kind'],
  ref: string,
  catalog?: { triggers?: readonly string[]; actions?: readonly string[]; conditions?: readonly string[] }
): boolean {
  if (!ref) return false;
  if (catalog) {
    if (kind === 'trigger') return (catalog.triggers ?? []).includes(ref);
    if (kind === 'action') return (catalog.actions ?? []).includes(ref);
    if (kind === 'condition' || kind === 'router') {
      return (catalog.conditions ?? []).includes(ref);
    }
    return true; // delay has no ref constraint
  }
  if (kind === 'trigger') return KNOWN_TRIGGER_REFS.has(ref);
  if (kind === 'action') return KNOWN_ACTION_REFS.has(ref);
  if (kind === 'condition' || kind === 'router') return KNOWN_CONDITION_REFS.has(ref);
  return true;
}

/** Validate a canvas graph structurally + topologically. */
export function validateCanvasGraph(
  graph: CanvasGraphSpec,
  catalog?: { triggers?: readonly string[]; actions?: readonly string[]; conditions?: readonly string[] }
): CanvasValidationResult {
  const issues: CanvasValidationIssue[] = [];

  if (!graph || graph.version !== 1) {
    issues.push({ code: 'ok' === 'ok' ? 'ok' : 'ok', message: 'unsupported graph version' });
    return { ok: false, issues };
  }

  if (graph.nodes.length > MAX_CANVAS_NODES) {
    issues.push({ code: 'too_many_nodes', message: `nodes ${graph.nodes.length} > ${MAX_CANVAS_NODES}` });
  }
  if (graph.edges.length > MAX_CANVAS_EDGES) {
    issues.push({ code: 'too_many_edges', message: `edges ${graph.edges.length} > ${MAX_CANVAS_EDGES}` });
  }

  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (!CANVAS_NODE_ID_RE.test(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `invalid node id: ${n.id}` });
    } else if (ids.has(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `duplicate node id: ${n.id}` });
    } else {
      ids.add(n.id);
    }
    if (!resolveNodeRef(n.kind, n.ref, catalog)) {
      issues.push({ code: 'unknown_node_ref', target: n.id, message: `unknown ${n.kind} ref: ${n.ref}` });
    }
  }

  for (const e of graph.edges) {
    if (e.from === e.to) {
      issues.push({ code: 'edge_self_loop', target: e.id, message: `self-loop on ${e.from}` });
    }
    if (!ids.has(e.from)) {
      issues.push({ code: 'edge_references_missing_node', target: e.id, message: `from ${e.from} missing` });
    }
    if (!ids.has(e.to)) {
      issues.push({ code: 'edge_references_missing_node', target: e.id, message: `to ${e.to} missing` });
    }
  }

  // Missing-trigger check: at least one node.kind === 'trigger'.
  if (!graph.nodes.some((n) => n.kind === 'trigger')) {
    issues.push({ code: 'missing_trigger', message: 'graph has no trigger node' });
  }

  // Cycle detection via Kahn's algorithm.
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of graph.nodes) {
    if (!adj.has(n.id)) adj.set(n.id, []);
    if (!indeg.has(n.id)) indeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of graph.nodes) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id);
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
  if (visited.size !== graph.nodes.length) {
    issues.push({ code: 'cycle_detected', message: `cycle: visited ${visited.size}/${graph.nodes.length}` });
  }

  // Unreachable action: nodes not reachable from any trigger.
  if (issues.every((i) => i.code !== 'cycle_detected')) {
    const triggers = graph.nodes.filter((n) => n.kind === 'trigger').map((n) => n.id);
    const reach = new Set<string>(triggers);
    const stack = [...triggers];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of graph.edges) {
        if (e.from === cur && !reach.has(e.to)) {
          reach.add(e.to);
          stack.push(e.to);
        }
      }
    }
    for (const n of graph.nodes) {
      if (n.kind === 'action' && !reach.has(n.id)) {
        issues.push({ code: 'unreachable_action', target: n.id, message: `unreachable: ${n.id}` });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Topologically order nodes (Kahn's algorithm). */
export function topoSort(graph: CanvasGraphSpec): string[] {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of graph.nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (!adj.has(e.from) || !indeg.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of graph.nodes) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id);
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

/** Build a complete execution plan from a graph. */
export function planCanvasExecution(graph: CanvasGraphSpec): CanvasExecutionPlan {
  const validation = validateCanvasGraph(graph);
  const linear = validation.ok;
  const order = linear ? topoSort(graph) : [];
  const downstream = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = downstream.get(e.from) ?? [];
    list.push(e.to);
    downstream.set(e.from, list);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const steps: CanvasExecutionStep[] = order
    .map((id, idx) => byId.get(id)!)
    .filter(Boolean)
    .map((n, idx) => ({
      index: idx,
      nodeId: n.id,
      kind: n.kind,
      ref: n.ref,
      downstream: downstream.get(n.id) ?? [],
    }));
  return { graphId: graph.id, steps, linear };
}

/** Add a node (returns a new graph, never mutates). */
export function addNode(graph: CanvasGraphSpec, node: CanvasNodeSpec): CanvasGraphSpec {
  if (graph.nodes.some((n) => n.id === node.id)) return graph;
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Remove a node and its incident edges. */
export function removeNode(graph: CanvasGraphSpec, nodeId: string): CanvasGraphSpec {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

/** Add an edge (idempotent on (from,to,branch)). */
export function addEdge(graph: CanvasGraphSpec, edge: CanvasEdgeSpec): CanvasGraphSpec {
  const dup = graph.edges.some(
    (e) => e.from === edge.from && e.to === edge.to && (e.branch ?? '') === (edge.branch ?? '')
  );
  if (dup) return graph;
  return { ...graph, edges: [...graph.edges, edge] };
}

/** Remove an edge by id. */
export function removeEdge(graph: CanvasGraphSpec, edgeId: string): CanvasGraphSpec {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

/** Move a node to a new position. */
export function moveNode(
  graph: CanvasGraphSpec,
  nodeId: string,
  position: { x: number; y: number }
): CanvasGraphSpec {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
  };
}

/** Serialize the graph to a deterministic JSON string for hashing. */
export function serializeGraph(graph: CanvasGraphSpec): string {
  return JSON.stringify(graph, Object.keys(graph).sort());
}

/** Summary stats for the canvas (used by UI side panel). */
export function summarizeCanvas(graph: CanvasGraphSpec): {
  nodeCount: number;
  edgeCount: number;
  triggers: number;
  actions: number;
  conditions: number;
  disabled: number;
} {
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    triggers: graph.nodes.filter((n) => n.kind === 'trigger').length,
    actions: graph.nodes.filter((n) => n.kind === 'action').length,
    conditions: graph.nodes.filter((n) => n.kind === 'condition' || n.kind === 'router').length,
    disabled: graph.nodes.filter((n) => n.disabled).length,
  };
}

/** Return nodes grouped by kind, useful for editor palette. */
export function groupNodesByKind(graph: CanvasGraphSpec): Record<string, CanvasNodeSpec[]> {
  const out: Record<string, CanvasNodeSpec[]> = {};
  for (const n of graph.nodes) {
    (out[n.kind] ??= []).push(n);
  }
  return out;
}