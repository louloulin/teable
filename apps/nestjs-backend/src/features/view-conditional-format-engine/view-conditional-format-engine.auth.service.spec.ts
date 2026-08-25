/**
 * View Conditional Format Engine — NestJS auth service spec (Stage 114).
 */

import { ViewConditionalFormatEngineAuthService } from './view-conditional-format-engine.auth.service';
import { FormatRule } from './view-conditional-format-engine.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ViewConditionalFormatEngineAuthService(makePrisma() as never);
}
function equalsRule(): FormatRule {
  return { fieldId: 'a', op: 'equals', value: 'x', visualization: 'color', style: '#f00' };
}

describe('ViewConditionalFormatEngineAuthService.evaluate', () => {
  it('match', () => {
    expect(setup().evaluate(equalsRule(), { fieldId: 'a', value: 'x' })).not.toBeNull();
  });
});

describe('ViewConditionalFormatEngineAuthService.apply', () => {
  it('first per viz', () => {
    const r1: FormatRule = { fieldId: 'a', op: 'equals', value: 'x', visualization: 'color', style: '#f00' };
    const r2: FormatRule = { fieldId: 'a', op: 'equals', value: 'x', visualization: 'icon' };
    const res = setup().apply([r1, r2], { fieldId: 'a', value: 'x' });
    expect(res.directives.length).toBe(2);
  });
});

describe('ViewConditionalFormatEngineAuthService.firstMatch / count', () => {
  it('firstMatch', () => {
    expect(setup().firstMatch([equalsRule()], { fieldId: 'a', value: 'x' })).not.toBeNull();
  });
  it('count', () => {
    expect(setup().count([equalsRule()], [
      { fieldId: 'a', value: 'x' },
      { fieldId: 'a', value: 'y' },
    ])).toBe(1);
  });
});

describe('ViewConditionalFormatEngineAuthService.isValid / filter', () => {
  it('valid', () => expect(setup().isValid(equalsRule())).toBe(true));
  it('filter', () => {
    expect(setup().filter([equalsRule(), { fieldId: '', op: 'equals', value: 1, visualization: 'color' }]).length).toBe(1);
  });
});

describe('ViewConditionalFormatEngineAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});