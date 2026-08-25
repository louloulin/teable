/**
 * Automation Canvas — pure helpers spec (Stage 107).
 */

import {
  addEdge,
  addNode,
  groupNodesByKind,
  moveNode,
  planCanvasExecution,
  removeEdge,
  removeNode,
  resolveNodeRef,
  serializeGraph,
  summarizeCanvas,
  topoSort,
  validateCanvasGraph,
} from './automation-canvas.service';
import { CanvasGraphSpec } from './automation-canvas.types';

function graph(over: Partial<CanvasGraphSpec> = {}): CanvasGraphSpec {
  return {
    id: 'g1',
    name: 'G',
    version: 1,
    nodes: [
      { id: 't1', kind: 'trigger', ref: 'record_created', label: 'T', position: { x: 0, y: 0 }, config: {} },
      { id: 'a1', kind: 'action', ref: 'update_record', label: 'A', position: { x: 1, y: 0 }, config: {} },
    ],
    edges: [{ id: 'e1', from: 't1', to: 'a1' }],
    ...over,
  };
}

describe('automation-canvas.resolveNodeRef', () => {
  it('matches built-ins', () => {
    expect(resolveNodeRef('trigger', 'record_created')).toBe(true);
    expect(resolveNodeRef('action', 'unknown_xxx')).toBe(false);
  });
  it('respects catalog', () => {
    expect(
      resolveNodeRef('trigger', 'foo', { triggers: ['foo'] })
    ).toBe(true);
    expect(
      resolveNodeRef('action', 'foo', { triggers: ['foo'] })
    ).toBe(false);
  });
});

describe('automation-canvas.validateCanvasGraph', () => {
  it('valid simple graph', () => {
    const v = validateCanvasGraph(graph());
    expect(v.ok).toBe(true);
  });
  it('flags missing trigger', () => {
    const g: CanvasGraphSpec = {
      ...graph(),
      nodes: [
        { id: 'a1', kind: 'action', ref: 'update_record', label: 'A', position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    };
    const v = validateCanvasGraph(g);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === 'missing_trigger')).toBe(true);
  });
  it('flags cycle', () => {
    const g: CanvasGraphSpec = {
      ...graph(),
      edges: [
        { id: 'e1', from: 't1', to: 'a1' },
        { id: 'e2', from: 'a1', to: 't1' },
      ],
    };
    const v = validateCanvasGraph(g);
    expect(v.issues.some((i) => i.code === 'cycle_detected')).toBe(true);
  });
  it('flags self-loop', () => {
    const g: CanvasGraphSpec = {
      ...graph(),
      edges: [{ id: 'e1', from: 't1', to: 't1' }],
    };
    const v = validateCanvasGraph(g);
    expect(v.issues.some((i) => i.code === 'edge_self_loop')).toBe(true);
  });
  it('flags duplicate node id', () => {
    const g: CanvasGraphSpec = {
      ...graph(),
      nodes: [
        { id: 'a1', kind: 'action', ref: 'update_record', label: 'A', position: { x: 0, y: 0 }, config: {} },
        { id: 'a1', kind: 'action', ref: 'update_record', label: 'B', position: { x: 1, y: 0 }, config: {} },
      ],
      edges: [],
    };
    const v = validateCanvasGraph(g);
    expect(v.issues.some((i) => i.code === 'duplicate_node_id')).toBe(true);
  });
  it('flags unreachable action', () => {
    const g: CanvasGraphSpec = {
      ...graph(),
      nodes: [
        { id: 't1', kind: 'trigger', ref: 'record_created', label: 'T', position: { x: 0, y: 0 }, config: {} },
        { id: 'a1', kind: 'action', ref: 'update_record', label: 'A', position: { x: 1, y: 0 }, config: {} },
        { id: 'a2', kind: 'action', ref: 'update_record', label: 'B', position: { x: 2, y: 0 }, config: {} },
      ],
      edges: [{ id: 'e1', from: 't1', to: 'a1' }],
    };
    const v = validateCanvasGraph(g);
    expect(v.issues.some((i) => i.code === 'unreachable_action')).toBe(true);
  });
});

describe('automation-canvas.topoSort / planCanvasExecution', () => {
  it('orders simple chain', () => {
    const order = topoSort(graph());
    expect(order.indexOf('t1')).toBeLessThan(order.indexOf('a1'));
  });
  it('builds plan', () => {
    const plan = planCanvasExecution(graph());
    expect(plan.linear).toBe(true);
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].nodeId).toBe('t1');
  });
});

describe('automation-canvas.addNode / removeNode / addEdge / removeEdge / moveNode', () => {
  it('adds node idempotently', () => {
    const g0 = graph();
    const g1 = addNode(g0, { id: 'c1', kind: 'condition', ref: 'equals', label: 'C', position: { x: 0, y: 1 }, config: {} });
    const g2 = addNode(g1, { id: 'c1', kind: 'condition', ref: 'equals', label: 'C', position: { x: 0, y: 1 }, config: {} });
    expect(g2.nodes.length).toBe(g1.nodes.length);
  });
  it('removes node + incident edges', () => {
    const g = removeNode(graph(), 'a1');
    expect(g.nodes.length).toBe(1);
    expect(g.edges.length).toBe(0);
  });
  it('adds edge idempotent on from/to/branch', () => {
    const g0 = graph();
    const g1 = addEdge(g0, { id: 'e2', from: 'a1', to: 't1' });
    const g2 = addEdge(g1, { id: 'e3', from: 'a1', to: 't1' });
    expect(g2.edges.length).toBe(g1.edges.length);
  });
  it('removes edge by id', () => {
    const g = removeEdge(graph(), 'e1');
    expect(g.edges.length).toBe(0);
  });
  it('moves node', () => {
    const g = moveNode(graph(), 't1', { x: 7, y: 8 });
    expect(g.nodes.find((n) => n.id === 't1')!.position).toEqual({ x: 7, y: 8 });
  });
});

describe('automation-canvas.serializeGraph / summarizeCanvas / groupNodesByKind', () => {
  it('serializes deterministically', () => {
    const s1 = serializeGraph(graph());
    const s2 = serializeGraph(graph());
    expect(s1).toBe(s2);
  });
  it('summarizes', () => {
    const s = summarizeCanvas(graph());
    expect(s.nodeCount).toBe(2);
    expect(s.triggers).toBe(1);
    expect(s.actions).toBe(1);
  });
  it('groups by kind', () => {
    const g = groupNodesByKind(graph());
    expect(Object.keys(g).sort()).toEqual(['action', 'trigger']);
  });
});