/**
 * Automation Trigger Catalog — NestJS auth service spec (Stage 108).
 */

import { AutomationTriggerCatalogAuthService } from './automation-trigger-catalog.auth.service';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}

function setup() {
  const prisma = makePrisma();
  const svc = new AutomationTriggerCatalogAuthService(prisma as never);
  return { svc };
}

describe('AutomationTriggerCatalogAuthService.get / list / group / index', () => {
  it('get catalog', () => {
    const { svc } = setup();
    expect(svc.getCatalog().types.length).toBe(6);
  });
  it('get', () => {
    const { svc } = setup();
    expect(svc.get('record_created')?.label).toBe('Record created');
    expect(svc.get('nope')).toBeUndefined();
  });
  it('listByCategory', () => {
    const { svc } = setup();
    expect(svc.listByCategory('record').length).toBe(3);
  });
  it('groupByCategory', () => {
    const { svc } = setup();
    expect(Object.keys(svc.groupByCategory()).length).toBeGreaterThan(0);
  });
  it('index', () => {
    const { svc } = setup();
    expect(svc.index().size).toBe(6);
  });
});

describe('AutomationTriggerCatalogAuthService.validate / missing / hasOutput', () => {
  it('validate', () => {
    const { svc } = setup();
    expect(svc.validate('record_created', { tableId: 't' }).ok).toBe(true);
    expect(svc.validate('record_created', {}).ok).toBe(false);
  });
  it('missing', () => {
    const { svc } = setup();
    expect(svc.missing('record_created', {}).length).toBeGreaterThan(0);
  });
  it('hasOutput', () => {
    const { svc } = setup();
    expect(svc.hasOutput('record_created', 'recordId')).toBe(true);
  });
});

describe('AutomationTriggerCatalogAuthService.extend / serialize / summarize / ping', () => {
  it('extend', () => {
    const { svc } = setup();
    const before = svc.getCatalog().types.length;
    svc.extend({
      version: 1,
      defaultType: 'manual',
      types: [{ type: 'extra', label: 'E', category: 'system', description: '', icon: '', fields: [], outputKeys: [] }],
    });
    expect(svc.getCatalog().types.length).toBe(before + 1);
  });
  it('serialize', () => {
    const { svc } = setup();
    expect(svc.serialize().length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const { svc } = setup();
    expect(svc.summarize().count).toBe(6);
  });
  it('ping', async () => {
    const { svc } = setup();
    expect(await svc.ping()).toBe(true);
  });
});