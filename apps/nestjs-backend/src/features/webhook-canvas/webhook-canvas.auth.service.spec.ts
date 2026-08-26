/**
 * Webhook Canvas — NestJS auth service spec (Stage 110).
 */

import { WebhookCanvasAuthService } from './webhook-canvas.auth.service';
import { WebhookCanvasSpec } from './webhook-canvas.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}
function setup() {
  const prisma = makePrisma();
  const svc = new WebhookCanvasAuthService(prisma as never);
  return { svc };
}
function canvas(): WebhookCanvasSpec {
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
      { id: 'u', kind: 'url', ref: 'http_post', label: 'U', position: { x: 1, y: 0 }, config: {} },
    ],
    edges: [{ id: 'e1', from: 'src', to: 'u' }],
  };
}

describe('WebhookCanvasAuthService.validate / plan / topo', () => {
  it('validate', () => {
    const { svc } = setup();
    expect(svc.validate(canvas()).ok).toBe(true);
  });
  it('plan', () => {
    const { svc } = setup();
    expect(svc.plan(canvas()).linear).toBe(true);
  });
  it('topo', () => {
    const { svc } = setup();
    expect(svc.topo(canvas()).length).toBe(2);
  });
});

describe('WebhookCanvasAuthService helpers', () => {
  it('addNode / removeNode / addEdge / removeEdge / moveNode', () => {
    const { svc } = setup();
    const c0 = canvas();
    const c1 = svc.addNode(c0, {
      id: 'r',
      kind: 'retry',
      ref: 'retry_block',
      label: 'R',
      position: { x: 0, y: 1 },
      config: {},
    });
    expect(c1.nodes.length).toBe(3);
    const c2 = svc.removeNode(c1, 'r');
    expect(c2.nodes.length).toBe(2);
    const c3 = svc.addEdge(c2, { id: 'e2', from: 'u', to: 'src' });
    expect(c3.edges.length).toBe(2);
    const c4 = svc.removeEdge(c3, 'e2');
    expect(c4.edges.length).toBe(1);
    const c5 = svc.moveNode(c4, 'src', { x: 5, y: 5 });
    expect(c5.nodes.find((n) => n.id === 'src')!.position).toEqual({ x: 5, y: 5 });
  });
  it('groupByKind / summarize / serialize', () => {
    const { svc } = setup();
    expect(Object.keys(svc.groupByKind(canvas())).sort()).toEqual(['source', 'url']);
    expect(svc.summarize(canvas()).urls).toBe(1);
    expect(svc.serialize(canvas()).length).toBeGreaterThan(0);
  });
});

describe('WebhookCanvasAuthService.ping', () => {
  it('true', async () => {
    const { svc } = setup();
    expect(await svc.ping()).toBe(true);
  });
});
