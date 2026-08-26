/**
 * DR Canvas — pure helpers spec (Stage 111).
 */

import {
  addDrEdge,
  addDrNode,
  findDrNodeByCheckpoint,
  listDrCheckpoints,
  moveDrNode,
  planDrExecution,
  removeDrEdge,
  removeDrNode,
  serializeDrCanvas,
  summarizeDrCanvas,
  topoSortDr,
  validateDrCanvas,
} from './dr-canvas.service';
import { DrCanvasSpec } from './dr-canvas.types';

function canvas(over: Partial<DrCanvasSpec> = {}): DrCanvasSpec {
  return {
    id: 'd1',
    name: 'DR',
    version: 1,
    target: { source: 'primary', destination: 'replica' },
    nodes: [
      {
        id: 's',
        kind: 'snapshot',
        ref: 'pg_dump',
        label: 'S',
        position: { x: 0, y: 0 },
        config: {},
        checkpoint: { id: 'cp1', marker: 'lsn:100', takenAt: 1 },
      },
      {
        id: 'r',
        kind: 'replicate',
        ref: 'incremental_replicate',
        label: 'R',
        position: { x: 1, y: 0 },
        config: {},
      },
      {
        id: 't',
        kind: 'restore',
        ref: 'restore_snapshot',
        label: 'T',
        position: { x: 2, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: 'e1', from: 's', to: 'r' },
      { id: 'e2', from: 'r', to: 't' },
    ],
    ...over,
  };
}

describe('dr-canvas.validateDrCanvas', () => {
  it('valid simple canvas', () => {
    expect(validateDrCanvas(canvas()).ok).toBe(true);
  });
  it('flags missing snapshot', () => {
    const c = canvas();
    c.nodes = c.nodes.filter((n) => n.kind !== 'snapshot');
    c.nodes.push({
      id: 'r',
      kind: 'replicate',
      ref: 'incremental_replicate',
      label: 'R',
      position: { x: 1, y: 0 },
      config: {},
    });
    const v = validateDrCanvas(c);
    expect(v.issues.some((i) => i.code === 'no_snapshot')).toBe(true);
  });
  it('flags missing restore', () => {
    const c = canvas();
    c.nodes = c.nodes.filter((n) => n.kind !== 'restore');
    c.nodes.push({
      id: 'r',
      kind: 'replicate',
      ref: 'incremental_replicate',
      label: 'R',
      position: { x: 1, y: 0 },
      config: {},
    });
    const v = validateDrCanvas(c);
    expect(v.issues.some((i) => i.code === 'no_restore')).toBe(true);
  });
  it('flags cycle', () => {
    const c = canvas();
    c.edges.push({ id: 'e3', from: 't', to: 's' });
    const v = validateDrCanvas(c);
    expect(v.issues.some((i) => i.code === 'cycle_detected')).toBe(true);
  });
  it('flags missing checkpoint on edge', () => {
    const c = canvas();
    c.edges.push({ id: 'e3', from: 's', to: 't', requiresCheckpoint: 'cp_does_not_exist' });
    const v = validateDrCanvas(c);
    expect(v.issues.some((i) => i.code === 'missing_required_checkpoint')).toBe(true);
  });
  it('flags duplicate ids', () => {
    const c = canvas();
    c.nodes.push({
      id: 's',
      kind: 'snapshot',
      ref: 'pg_dump',
      label: 'S2',
      position: { x: 0, y: 1 },
      config: {},
    });
    const v = validateDrCanvas(c);
    expect(v.issues.some((i) => i.code === 'duplicate_node_id')).toBe(true);
  });
});

describe('dr-canvas.topo / plan', () => {
  it('topo', () => {
    const order = topoSortDr(canvas());
    expect(order.indexOf('s')).toBeLessThan(order.indexOf('t'));
  });
  it('plan', () => {
    const p = planDrExecution(canvas());
    expect(p.linear).toBe(true);
    expect(p.steps.length).toBe(3);
    expect(p.checkpointCount).toBe(1);
  });
});

describe('dr-canvas.addNode / removeNode / addEdge / removeEdge / moveNode', () => {
  it('addNode idempotent', () => {
    const c0 = canvas();
    const c1 = addDrNode(c0, {
      id: 'v',
      kind: 'verify',
      ref: 'verify_checksum',
      label: 'V',
      position: { x: 1, y: 1 },
      config: {},
    });
    const c2 = addDrNode(c1, {
      id: 'v',
      kind: 'verify',
      ref: 'verify_checksum',
      label: 'V',
      position: { x: 1, y: 1 },
      config: {},
    });
    expect(c2.nodes.length).toBe(c1.nodes.length);
  });
  it('removeNode', () => {
    const c = removeDrNode(canvas(), 'r');
    expect(c.nodes.length).toBe(2);
    expect(c.edges.length).toBe(0);
  });
  it('addEdge idempotent on (from,to,checkpoint)', () => {
    const c0 = canvas();
    const c1 = addDrEdge(c0, { id: 'e3', from: 's', to: 'r' });
    expect(c1.edges.length).toBe(c0.edges.length);
  });
  it('removeEdge', () => {
    const c = removeDrEdge(canvas(), 'e1');
    expect(c.edges.length).toBe(1);
  });
  it('moveNode', () => {
    const c = moveDrNode(canvas(), 's', { x: 9, y: 9 });
    expect(c.nodes.find((n) => n.id === 's')!.position).toEqual({ x: 9, y: 9 });
  });
});

describe('dr-canvas.findByCheckpoint / listCheckpoints / serialize / summarize', () => {
  it('findByCheckpoint', () => {
    const c = canvas();
    expect(findDrNodeByCheckpoint(c, 'cp1')?.id).toBe('s');
    expect(findDrNodeByCheckpoint(c, 'nope')).toBeUndefined();
  });
  it('listCheckpoints', () => {
    expect(listDrCheckpoints(canvas()).length).toBe(1);
  });
  it('serialize', () => {
    expect(serializeDrCanvas(canvas()).length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const s = summarizeDrCanvas(canvas());
    expect(s.snapshots).toBe(1);
    expect(s.restores).toBe(1);
    expect(s.checkpoints).toBe(1);
  });
});
