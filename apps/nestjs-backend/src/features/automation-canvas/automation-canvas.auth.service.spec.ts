/**
 * Automation Canvas — NestJS auth service spec (Stage 107).
 */

import { AutomationCanvasAuthService } from './automation-canvas.auth.service';
import { CanvasGraphSpec } from './automation-canvas.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

function setup() {
  const prisma = makePrisma();
  const svc = new AutomationCanvasAuthService(prisma as never);
  return { svc };
}

function graph(): CanvasGraphSpec {
  return {
    id: 'g1',
    name: 'G',
    version: 1,
    nodes: [
      { id: 't1', kind: 'trigger', ref: 'record_created', label: 'T', position: { x: 0, y: 0 }, config: {} },
      { id: 'a1', kind: 'action', ref: 'update_record', label: 'A', position: { x: 1, y: 0 }, config: {} },
    ],
    edges: [{ id: 'e1', from: 't1', to: 'a1' }],
  };
}

describe('AutomationCanvasAuthService.validate / plan / topo', () => {
  it('validate ok', () => {
    const { svc } = setup();
    expect(svc.validate(graph()).ok).toBe(true);
  });
  it('plan linear', () => {
    const { svc } = setup();
    const plan = svc.plan(graph());
    expect(plan.linear).toBe(true);
  });
  it('topo', () => {
    const { svc } = setup();
    expect(svc.topo(graph()).length).toBe(2);
  });
});

describe('AutomationCanvasAuthService helpers', () => {
  it('resolveRef', () => {
    const { svc } = setup();
    expect(svc.resolveRef('trigger', 'record_created')).toBe(true);
    expect(svc.resolveRef('action', 'unknown_xxx')).toBe(false);
  });
  it('addNode / removeNode / addEdge / removeEdge / moveNode', () => {
    const { svc } = setup();
    const g0 = graph();
    const g1 = svc.addNode(g0, { id: 'c1', kind: 'condition', ref: 'equals', label: 'C', position: { x: 0, y: 1 }, config: {} });
    expect(g1.nodes.length).toBe(3);
    const g2 = svc.removeNode(g1, 'c1');
    expect(g2.nodes.length).toBe(2);
    const g3 = svc.addEdge(g2, { id: 'e2', from: 'a1', to: 't1' });
    expect(g3.edges.length).toBe(2);
    const g4 = svc.removeEdge(g3, 'e2');
    expect(g4.edges.length).toBe(1);
    const g5 = svc.moveNode(g4, 't1', { x: 9, y: 9 });
    expect(g5.nodes.find((n) => n.id === 't1')!.position).toEqual({ x: 9, y: 9 });
  });
  it('groupByKind / summarize / serialize', () => {
    const { svc } = setup();
    expect(Object.keys(svc.groupByKind(graph())).sort()).toEqual(['action', 'trigger']);
    expect(svc.summarize(graph()).nodeCount).toBe(2);
    expect(svc.serialize(graph()).length).toBeGreaterThan(0);
  });
});

describe('AutomationCanvasAuthService.ping', () => {
  it('true', async () => {
    const { svc } = setup();
    expect(await svc.ping()).toBe(true);
  });
});