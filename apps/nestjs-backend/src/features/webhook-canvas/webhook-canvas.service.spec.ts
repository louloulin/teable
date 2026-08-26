/**
 * Webhook Canvas — pure helpers spec (Stage 110).
 */

import {
  addWebhookEdge,
  addWebhookNode,
  groupWebhookNodesByKind,
  moveWebhookNode,
  planWebhookExecution,
  removeWebhookEdge,
  removeWebhookNode,
  serializeWebhookCanvas,
  summarizeWebhookCanvas,
  topoSortWebhook,
  validateWebhookCanvas,
} from './webhook-canvas.service';
import { WebhookCanvasSpec } from './webhook-canvas.types';

function canvas(over: Partial<WebhookCanvasSpec> = {}): WebhookCanvasSpec {
  return {
    id: 'w1',
    name: 'W',
    version: 1,
    nodes: [
      {
        id: 'src',
        kind: 'source',
        ref: 'event_source',
        label: 'S',
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: 'pick',
        kind: 'transform',
        ref: 'pick_fields',
        label: 'P',
        position: { x: 1, y: 0 },
        config: {},
      },
      {
        id: 'u',
        kind: 'url',
        ref: 'http_post',
        label: 'U',
        position: { x: 2, y: 0 },
        config: { url: 'https://x' },
      },
    ],
    edges: [
      { id: 'e1', from: 'src', to: 'pick' },
      { id: 'e2', from: 'pick', to: 'u' },
    ],
    ...over,
  };
}

describe('webhook-canvas.validateWebhookCanvas', () => {
  it('valid simple canvas', () => {
    expect(validateWebhookCanvas(canvas()).ok).toBe(true);
  });
  it('flags no url terminal', () => {
    const c = canvas({
      nodes: [
        {
          id: 'src',
          kind: 'source',
          ref: 'event_source',
          label: 'S',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'pick',
          kind: 'transform',
          ref: 'pick_fields',
          label: 'P',
          position: { x: 1, y: 0 },
          config: {},
        },
      ],
      edges: [{ id: 'e1', from: 'src', to: 'pick' }],
    });
    const v = validateWebhookCanvas(c);
    expect(v.issues.some((i) => i.code === 'no_url_terminal')).toBe(true);
  });
  it('flags cycle', () => {
    const c = canvas();
    c.edges.push({ id: 'e3', from: 'u', to: 'src' });
    const v = validateWebhookCanvas(c);
    expect(v.issues.some((i) => i.code === 'cycle_detected')).toBe(true);
  });
  it('flags duplicate ids', () => {
    const c = canvas();
    c.nodes.push({
      id: 'src',
      kind: 'source',
      ref: 'event_source',
      label: 'S2',
      position: { x: 0, y: 1 },
      config: {},
    });
    const v = validateWebhookCanvas(c);
    expect(v.issues.some((i) => i.code === 'duplicate_node_id')).toBe(true);
  });
});

describe('webhook-canvas.topo / plan', () => {
  it('topo', () => {
    const order = topoSortWebhook(canvas());
    expect(order.indexOf('src')).toBeLessThan(order.indexOf('u'));
  });
  it('plan', () => {
    const p = planWebhookExecution(canvas());
    expect(p.linear).toBe(true);
    expect(p.steps.length).toBe(3);
  });
});

describe('webhook-canvas.addNode / removeNode / addEdge / removeEdge / moveNode', () => {
  it('addNode idempotent', () => {
    const c0 = canvas();
    const c1 = addWebhookNode(c0, {
      id: 'r',
      kind: 'retry',
      ref: 'retry_block',
      label: 'R',
      position: { x: 1, y: 1 },
      config: {},
    });
    const c2 = addWebhookNode(c1, {
      id: 'r',
      kind: 'retry',
      ref: 'retry_block',
      label: 'R',
      position: { x: 1, y: 1 },
      config: {},
    });
    expect(c2.nodes.length).toBe(c1.nodes.length);
  });
  it('removeNode drops incident', () => {
    const c = removeWebhookNode(canvas(), 'pick');
    expect(c.nodes.length).toBe(2);
    expect(c.edges.length).toBe(0);
  });
  it('addEdge idempotent', () => {
    const c0 = canvas();
    const c1 = addWebhookEdge(c0, { id: 'e3', from: 'src', to: 'pick' });
    expect(c1.edges.length).toBe(c0.edges.length);
  });
  it('removeEdge', () => {
    const c = removeWebhookEdge(canvas(), 'e1');
    expect(c.edges.length).toBe(1);
  });
  it('moveNode', () => {
    const c = moveWebhookNode(canvas(), 'src', { x: 9, y: 9 });
    expect(c.nodes.find((n) => n.id === 'src')!.position).toEqual({ x: 9, y: 9 });
  });
});

describe('webhook-canvas.serialize / summarize / groupByKind', () => {
  it('serialize', () => {
    expect(serializeWebhookCanvas(canvas()).length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const s = summarizeWebhookCanvas(canvas());
    expect(s.nodes).toBe(3);
    expect(s.urls).toBe(1);
  });
  it('groupByKind', () => {
    expect(Object.keys(groupWebhookNodesByKind(canvas())).sort()).toEqual([
      'source',
      'transform',
      'url',
    ]);
  });
});
