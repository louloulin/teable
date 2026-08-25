/**
 * Automation Canvas — types (Stage 107).
 *
 * Pure graph schema for the visual automation editor. Nodes represent
 * triggers/actions/conditions; edges are directed flows. Backend produces
 * and consumes this JSON; the UI renders the same shape with a DAG library.
 */

export type CanvasNodeKind = 'trigger' | 'action' | 'condition' | 'router' | 'delay';

export interface CanvasNodeSpec {
  id: string;
  kind: CanvasNodeKind;
  /** Type of the underlying trigger/action (e.g. 'record_created'). */
  ref: string;
  /** Free-form node label rendered in the canvas. */
  label: string;
  /** Display position in the editor canvas (logical units). */
  position: { x: number; y: number };
  /** Per-node config (port values, schedule, retry, etc.). */
  config: Record<string, unknown>;
  /** Optional disabled flag (kept in graph but excluded from execution). */
  disabled?: boolean;
}

export interface CanvasEdgeSpec {
  id: string;
  from: string;
  to: string;
  /** Optional router branch label (e.g. 'true' / 'false'). */
  branch?: string;
}

export interface CanvasGraphSpec {
  /** Stable identifier (uuid). */
  id: string;
  /** Automation name shown in editor header. */
  name: string;
  /** Schema version for forward-compatibility. */
  version: 1;
  /** Node list (order is not significant). */
  nodes: CanvasNodeSpec[];
  /** Directed edge list. */
  edges: CanvasEdgeSpec[];
  /** Optional canvas viewport for restore-on-open. */
  viewport?: { zoom: number; panX: number; panY: number };
}

/** Result of running validation on a graph. */
export type CanvasValidationCode =
  | 'ok'
  | 'duplicate_node_id'
  | 'unknown_node_ref'
  | 'edge_references_missing_node'
  | 'edge_self_loop'
  | 'cycle_detected'
  | 'missing_trigger'
  | 'unreachable_action'
  | 'too_many_nodes'
  | 'too_many_edges';

export interface CanvasValidationIssue {
  code: CanvasValidationCode;
  /** Node or edge id the issue relates to (when applicable). */
  target?: string;
  message: string;
}

export interface CanvasValidationResult {
  ok: boolean;
  issues: CanvasValidationIssue[];
}

/** Compiled execution plan (topologically ordered). */
export interface CanvasExecutionStep {
  index: number;
  nodeId: string;
  kind: CanvasNodeKind;
  ref: string;
  /** Downstream node ids that depend on this step's result. */
  downstream: string[];
}

export interface CanvasExecutionPlan {
  graphId: string;
  steps: CanvasExecutionStep[];
  /** True when the graph can be linearized (no cycles). */
  linear: boolean;
}

export const MAX_CANVAS_NODES = 256;
export const MAX_CANVAS_EDGES = 1024;
export const CANVAS_NODE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;