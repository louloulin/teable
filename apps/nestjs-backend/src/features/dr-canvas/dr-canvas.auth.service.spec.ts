/**
 * DR Canvas — NestJS auth service spec (Stage 111).
 */

import { DrCanvasAuthService } from './dr-canvas.auth.service';
import { DrCanvasSpec } from './dr-canvas.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}
function setup() {
  return new DrCanvasAuthService(makePrisma() as never);
}
function canvas(): DrCanvasSpec {
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
        id: 't',
        kind: 'restore',
        ref: 'restore_snapshot',
        label: 'T',
        position: { x: 1, y: 0 },
        config: {},
      },
    ],
    edges: [{ id: 'e1', from: 's', to: 't' }],
  };
}

describe('DrCanvasAuthService.validate / plan / topo', () => {
  it('validate', () => {
    const svc = setup();
    expect(svc.validate(canvas()).ok).toBe(true);
  });
  it('plan', () => {
    const svc = setup();
    const p = svc.plan(canvas());
    expect(p.linear).toBe(true);
    expect(p.checkpointCount).toBe(1);
  });
  it('topo', () => {
    const svc = setup();
    expect(svc.topo(canvas()).length).toBe(2);
  });
});

describe('DrCanvasAuthService helpers', () => {
  it('addNode / removeNode / addEdge / removeEdge / moveNode', () => {
    const svc = setup();
    const c0 = canvas();
    const c1 = svc.addNode(c0, {
      id: 'r',
      kind: 'replicate',
      ref: 'incremental_replicate',
      label: 'R',
      position: { x: 0, y: 1 },
      config: {},
    });
    expect(c1.nodes.length).toBe(3);
    const c2 = svc.removeNode(c1, 'r');
    expect(c2.nodes.length).toBe(2);
    const c3 = svc.addEdge(c2, { id: 'e2', from: 't', to: 's' });
    expect(c3.edges.length).toBe(2);
    const c4 = svc.removeEdge(c3, 'e2');
    expect(c4.edges.length).toBe(1);
    const c5 = svc.moveNode(c4, 's', { x: 7, y: 7 });
    expect(c5.nodes.find((n) => n.id === 's')!.position).toEqual({ x: 7, y: 7 });
  });
  it('findByCheckpoint / listCheckpoints / serialize / summarize', () => {
    const svc = setup();
    expect(svc.findByCheckpoint(canvas(), 'cp1')?.id).toBe('s');
    expect(svc.listCheckpoints(canvas()).length).toBe(1);
    expect(svc.serialize(canvas()).length).toBeGreaterThan(0);
    expect(svc.summarize(canvas()).snapshots).toBe(1);
  });
});

describe('DrCanvasAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});
