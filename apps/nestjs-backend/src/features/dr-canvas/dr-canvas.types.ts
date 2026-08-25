/**
 * DR Canvas — types (Stage 111).
 *
 * Disaster recovery orchestration: snapshot → replicate → restore.
 * Models a directed graph where nodes are ops and edges carry checkpoints.
 */

export type DrNodeKind = 'snapshot' | 'replicate' | 'restore' | 'verify' | 'notify' | 'checkpoint';

export interface DrCheckpointSpec {
  /** Checkpoint identifier (e.g. 'post-snapshot'). */
  id: string;
  /** LSN / timestamp / sequence this checkpoint records. */
  marker: string;
  /** When the checkpoint was issued. */
  takenAt: number;
}

export interface DrNodeSpec {
  id: string;
  kind: DrNodeKind;
  ref: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  /** Optional checkpoint produced by this node. */
  checkpoint?: DrCheckpointSpec;
  disabled?: boolean;
}

export interface DrEdgeSpec {
  id: string;
  from: string;
  to: string;
  /** Optional checkpoint the edge requires to traverse. */
  requiresCheckpoint?: string;
}

export interface DrCanvasSpec {
  id: string;
  name: string;
  version: 1;
  nodes: DrNodeSpec[];
  edges: DrEdgeSpec[];
  /** Cluster / region the canvas targets. */
  target: { source: string; destination: string };
}

export type DrValidationCode =
  | 'ok'
  | 'duplicate_node_id'
  | 'unknown_node_ref'
  | 'edge_references_missing_node'
  | 'cycle_detected'
  | 'no_snapshot'
  | 'no_restore'
  | 'missing_required_checkpoint'
  | 'too_many_nodes'
  | 'too_many_edges';

export interface DrValidationIssue {
  code: DrValidationCode;
  target?: string;
  message: string;
}

export interface DrValidationResult {
  ok: boolean;
  issues: DrValidationIssue[];
}

export interface DrExecutionStep {
  index: number;
  nodeId: string;
  kind: DrNodeKind;
  ref: string;
  checkpointId?: string;
  downstream: string[];
}

export interface DrExecutionPlan {
  canvasId: string;
  steps: DrExecutionStep[];
  linear: boolean;
  /** Total checkpoint count the plan emits. */
  checkpointCount: number;
}

export const MAX_DR_CANVAS_NODES = 64;
export const MAX_DR_CANVAS_EDGES = 256;
export const DR_NODE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;