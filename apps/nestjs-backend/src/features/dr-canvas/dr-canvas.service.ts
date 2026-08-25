/**
 * DR Canvas — pure helpers (Stage 111).
 */

import {
  DR_NODE_ID_RE,
  DrCanvasSpec,
  DrEdgeSpec,
  DrExecutionPlan,
  DrExecutionStep,
  DrNodeSpec,
  DrValidationIssue,
  DrValidationResult,
  MAX_DR_CANVAS_EDGES,
  MAX_DR_CANVAS_NODES,
} from './dr-canvas.types';

const KNOWN_REFS = new Set([
  'pg_dump',
  'pg_basebackup',
  's3_snapshot',
  'incremental_replicate',
  'full_replicate',
  'restore_pitr',
  'restore_snapshot',
  'verify_checksum',
  'verify_record_count',
  'send_email',
  'send_slack',
  'checkpoint_lsn',
  'checkpoint_ts',
]);

function resolveRef(kind: string, ref: string, catalog?: Record<string, readonly string[]>): boolean {
  if (!ref) return false;
  if (catalog) {
    const allowed = catalog[kind];
    return Array.isArray(allowed) && allowed.includes(ref);
  }
  return KNOWN_REFS.has(ref);
}

/** Validate DR canvas. */
export function validateDrCanvas(
  canvas: DrCanvasSpec,
  catalog?: Record<string, readonly string[]>
): DrValidationResult {
  const issues: DrValidationIssue[] = [];
  if (!canvas || canvas.version !== 1) {
    issues.push({ code: 'unknown_node_ref', message: 'unsupported version' });
    return { ok: false, issues };
  }
  if (canvas.nodes.length > MAX_DR_CANVAS_NODES) {
    issues.push({ code: 'too_many_nodes', message: `nodes ${canvas.nodes.length} > ${MAX_DR_CANVAS_NODES}` });
  }
  if (canvas.edges.length > MAX_DR_CANVAS_EDGES) {
    issues.push({ code: 'too_many_edges', message: `edges ${canvas.edges.length} > ${MAX_DR_CANVAS_EDGES}` });
  }
  const ids = new Set<string>();
  const checkpoints = new Set<string>();
  for (const n of canvas.nodes) {
    if (!DR_NODE_ID_RE.test(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `invalid id: ${n.id}` });
    } else if (ids.has(n.id)) {
      issues.push({ code: 'duplicate_node_id', target: n.id, message: `duplicate id: ${n.id}` });
    } else {
      ids.add(n.id);
    }
    if (!resolveRef(n.kind, n.ref, catalog)) {
      issues.push({ code: 'unknown_node_ref', target: n.id, message: `unknown ${n.kind} ref: ${n.ref}` });
    }
    if (n.checkpoint) checkpoints.add(n.checkpoint.id);
  }
  for (const e of canvas.edges) {
    if (!ids.has(e.from)) issues.push({ code: 'edge_references_missing_node', target: e.id, message: `from ${e.from}` });
    if (!ids.has(e.to)) issues.push({ code: 'edge_references_missing_node', target: e.id, message: `to ${e.to}` });
    if (e.requiresCheckpoint && !checkpoints.has(e.requiresCheckpoint)) {
      issues.push({ code: 'missing_required_checkpoint', target: e.id, message: `missing checkpoint ${e.requiresCheckpoint}` });
    }
  }
  if (!canvas.nodes.some((n) => n.kind === 'snapshot')) {
    issues.push({ code: 'no_snapshot', message: 'no snapshot node' });
  }
  if (!canvas.nodes.some((n) => n.kind === 'restore')) {
    issues.push({ code: 'no_restore', message: 'no restore node' });
  }
  // Cycle detection (Kahn).
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
    issues.push({ code: 'cycle_detected', message: `cycle ${visited.size}/${canvas.nodes.length}` });
  }
  return { ok: issues.length === 0, issues };
}

/** Topological sort. */
export function topoSortDr(canvas: DrCanvasSpec): string[] {
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

/** Plan execution with checkpoints. */
export function planDrExecution(canvas: DrCanvasSpec): DrExecutionPlan {
  const v = validateDrCanvas(canvas);
  const linear = v.ok;
  const order = linear ? topoSortDr(canvas) : [];
  const downstream = new Map<string, string[]>();
  for (const e of canvas.edges) {
    const list = downstream.get(e.from) ?? [];
    list.push(e.to);
    downstream.set(e.from, list);
  }
  const byId = new Map(canvas.nodes.map((n) => [n.id, n] as const));
  const steps: DrExecutionStep[] = order
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .map((n, idx) => ({
      index: idx,
      nodeId: n.id,
      kind: n.kind,
      ref: n.ref,
      checkpointId: n.checkpoint?.id,
      downstream: downstream.get(n.id) ?? [],
    }));
  return {
    canvasId: canvas.id,
    steps,
    linear,
    checkpointCount: canvas.nodes.filter((n) => n.checkpoint).length,
  };
}

/** Add a node. */
export function addDrNode(canvas: DrCanvasSpec, node: DrNodeSpec): DrCanvasSpec {
  if (canvas.nodes.some((n) => n.id === node.id)) return canvas;
  return { ...canvas, nodes: [...canvas.nodes, node] };
}

/** Remove node + incident edges. */
export function removeDrNode(canvas: DrCanvasSpec, nodeId: string): DrCanvasSpec {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => n.id !== nodeId),
    edges: canvas.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

/** Add edge. */
export function addDrEdge(canvas: DrCanvasSpec, edge: DrEdgeSpec): DrCanvasSpec {
  if (canvas.edges.some((e) => e.from === edge.from && e.to === edge.to && (e.requiresCheckpoint ?? '') === (edge.requiresCheckpoint ?? ''))) {
    return canvas;
  }
  return { ...canvas, edges: [...canvas.edges, edge] };
}

/** Remove edge. */
export function removeDrEdge(canvas: DrCanvasSpec, edgeId: string): DrCanvasSpec {
  return { ...canvas, edges: canvas.edges.filter((e) => e.id !== edgeId) };
}

/** Move node. */
export function moveDrNode(canvas: DrCanvasSpec, id: string, position: { x: number; y: number }): DrCanvasSpec {
  return { ...canvas, nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, position } : n)) };
}

/** Find node by checkpoint id. */
export function findDrNodeByCheckpoint(canvas: DrCanvasSpec, checkpointId: string): DrNodeSpec | undefined {
  return canvas.nodes.find((n) => n.checkpoint?.id === checkpointId);
}

/** List all checkpoints. */
export function listDrCheckpoints(canvas: DrCanvasSpec): DrCanvasSpec['nodes'][number]['checkpoint'][] {
  return canvas.nodes.map((n) => n.checkpoint).filter(Boolean);
}

/** Serialize. */
export function serializeDrCanvas(canvas: DrCanvasSpec): string {
  return JSON.stringify(canvas);
}

/** Summarize. */
export function summarizeDrCanvas(canvas: DrCanvasSpec): {
  nodes: number;
  edges: number;
  snapshots: number;
  restores: number;
  checkpoints: number;
} {
  return {
    nodes: canvas.nodes.length,
    edges: canvas.edges.length,
    snapshots: canvas.nodes.filter((n) => n.kind === 'snapshot').length,
    restores: canvas.nodes.filter((n) => n.kind === 'restore').length,
    checkpoints: canvas.nodes.filter((n) => n.checkpoint).length,
  };
}