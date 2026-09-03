/**
 * SourceImportCancellationService spec — verifies the synchronous cancel
 * propagation that drivers consult between progress events.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceImportCancellationService } from './source-import-cancellation.service';

function buildImports() {
  return {
    isCanceled: vi.fn(async () => false),
  };
}

describe('SourceImportCancellationService', () => {
  let svc: SourceImportCancellationService;
  let imports: ReturnType<typeof buildImports>;

  beforeEach(() => {
    imports = buildImports();
    svc = new SourceImportCancellationService(imports as never);
  });

  it('isCanceledSync is false before requestCancel', () => {
    expect(svc.isCanceledSync('sit_x')).toBe(false);
  });

  it('requestCancel flips the synchronous predicate', () => {
    svc.requestCancel('sit_x');
    expect(svc.isCanceledSync('sit_x')).toBe(true);
  });

  it('predicate returns a stable closure pointing at the same flag', () => {
    svc.requestCancel('sit_x');
    const pred = svc.predicate('sit_x');
    expect(pred()).toBe(true);
  });

  it('forget clears the flag', () => {
    svc.requestCancel('sit_x');
    svc.forget('sit_x');
    expect(svc.isCanceledSync('sit_x')).toBe(false);
  });

  it('absorbDbState mirrors a previously persisted cancel into memory', async () => {
    imports.isCanceled.mockResolvedValueOnce(true);
    const flag = await svc.absorbDbState('sit_y');
    expect(flag).toBe(true);
    expect(svc.isCanceledSync('sit_y')).toBe(true);
  });

  it('absorbDbState stays false when DB row is not canceled', async () => {
    imports.isCanceled.mockResolvedValueOnce(false);
    const flag = await svc.absorbDbState('sit_z');
    expect(flag).toBe(false);
    expect(svc.isCanceledSync('sit_z')).toBe(false);
  });

  it('requestCancel is idempotent', () => {
    svc.requestCancel('sit_a');
    svc.requestCancel('sit_a');
    expect(svc.isCanceledSync('sit_a')).toBe(true);
    svc.forget('sit_a');
  });
});
