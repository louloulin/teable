/**
 * Automation Action Catalog — NestJS auth service spec (Stage 109).
 */

import { AutomationActionCatalogAuthService } from './automation-action-catalog.auth.service';
import { IActionRetrySpec } from './automation-action-catalog.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}
function setup() {
  return new AutomationActionCatalogAuthService(makePrisma() as never);
}

describe('AutomationActionCatalogAuthService.get / list / group / index', () => {
  it('get / list / group / index', () => {
    const svc = setup();
    expect(svc.getCatalog().types.length).toBe(6);
    expect(svc.get('send_email')?.label).toBe('Send email');
    expect(svc.listByCategory('notification').length).toBe(2);
    expect(svc.groupByCategory()['notification'].length).toBe(2);
    expect(svc.index().size).toBe(6);
  });
});

describe('AutomationActionCatalogAuthService.validate / computeRetry / rollbackable', () => {
  it('validate', () => {
    const svc = setup();
    expect(svc.validate('send_email', { to: 'a@b', subject: 's', body: 'b' }).ok).toBe(true);
    expect(svc.validate('send_email', {}).ok).toBe(false);
  });
  it('computeRetry', () => {
    const svc = setup();
    const r: IActionRetrySpec = { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1000 };
    expect(svc.computeRetry(r)).toBe(7000);
  });
  it('rollbackable', () => {
    const svc = setup();
    expect(svc.rollbackable('update_record')).toBe(true);
    expect(svc.rollbackable('send_email')).toBe(false);
  });
});

describe('AutomationActionCatalogAuthService.extend / serialize / summarize / ping', () => {
  it('extend', () => {
    const svc = setup();
    const before = svc.getCatalog().types.length;
    svc.extend({ version: 1, defaultType: 'x', types: [] });
    expect(svc.getCatalog().types.length).toBe(before);
  });
  it('serialize', () => {
    const svc = setup();
    expect(svc.serialize().length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const svc = setup();
    expect(svc.summarize().count).toBe(6);
  });
  it('ping', async () => {
    const svc = setup();
    expect(await svc.ping()).toBe(true);
  });
});
