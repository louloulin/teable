/**
 * View Conditional Format Engine — pure helpers spec (Stage 114).
 */

import {
  applyRules,
  countMatches,
  evaluateRule,
  filterValid,
  firstMatch,
  isRuleValid,
} from './view-conditional-format-engine.service';
import { FormatRule } from './view-conditional-format-engine.types';

function equalsRule(style = '#f00'): FormatRule {
  return { fieldId: 'a', op: 'equals', value: 'x', visualization: 'color', style };
}
function gtRule(): FormatRule {
  return { fieldId: 'a', op: 'gt', value: 10, visualization: 'bar' };
}
function ltRule(): FormatRule {
  return { fieldId: 'a', op: 'lt', value: 100, visualization: 'color' };
}
function betweenRule(): FormatRule {
  return { fieldId: 'a', op: 'between', value: [0, 100], visualization: 'bar' };
}

describe('view-conditional-format-engine.evaluateRule', () => {
  it('equals match', () => {
    expect(evaluateRule(equalsRule(), { fieldId: 'a', value: 'x' })).not.toBeNull();
  });
  it('equals miss', () => {
    expect(evaluateRule(equalsRule(), { fieldId: 'a', value: 'y' })).toBeNull();
  });
  it('wrong field', () => {
    expect(evaluateRule(equalsRule(), { fieldId: 'b', value: 'x' })).toBeNull();
  });
  it('gt with intensity', () => {
    const d = evaluateRule(gtRule(), { fieldId: 'a', value: 20 });
    expect(d).not.toBeNull();
    expect(d!.intensity).toBeGreaterThan(0);
  });
  it('lt', () => {
    expect(evaluateRule(ltRule(), { fieldId: 'a', value: 50 })).not.toBeNull();
    expect(evaluateRule(ltRule(), { fieldId: 'a', value: 200 })).toBeNull();
  });
  it('between', () => {
    const d = evaluateRule(betweenRule(), { fieldId: 'a', value: 50 });
    expect(d).not.toBeNull();
    expect(d!.band).toBe('mid');
  });
  it('between with band min/max', () => {
    expect(evaluateRule(betweenRule(), { fieldId: 'a', value: 10 })!.band).toBe('min');
    expect(evaluateRule(betweenRule(), { fieldId: 'a', value: 90 })!.band).toBe('max');
  });
  it('between out of range', () => {
    expect(evaluateRule(betweenRule(), { fieldId: 'a', value: 200 })).toBeNull();
  });
  it('icon visualization defaults', () => {
    const r: FormatRule = { fieldId: 'a', op: 'equals', value: 1, visualization: 'icon' };
    const d = evaluateRule(r, { fieldId: 'a', value: 1 });
    expect(d).not.toBeNull();
  });
});

describe('view-conditional-format-engine.applyRules', () => {
  it('first match per viz', () => {
    const r1: FormatRule = { fieldId: 'a', op: 'equals', value: 'x', visualization: 'color', style: '#f00' };
    const r2: FormatRule = { fieldId: 'a', op: 'equals', value: 'x', visualization: 'color', style: '#0f0' };
    const r3: FormatRule = { fieldId: 'a', op: 'equals', value: 'x', visualization: 'icon' };
    const res = applyRules([r1, r2, r3], { fieldId: 'a', value: 'x' });
    expect(res.directives.length).toBe(2);
    expect(res.directives[0].style).toBe('#f00');
  });
});

describe('view-conditional-format-engine.firstMatch / countMatches', () => {
  it('firstMatch', () => {
    expect(firstMatch([equalsRule(), gtRule()], { fieldId: 'a', value: 'x' })).not.toBeNull();
  });
  it('countMatches', () => {
    expect(countMatches([equalsRule()], [
      { fieldId: 'a', value: 'x' },
      { fieldId: 'a', value: 'y' },
      { fieldId: 'a', value: 'x' },
    ])).toBe(2);
  });
});

describe('view-conditional-format-engine.isRuleValid', () => {
  it('valid equals', () => expect(isRuleValid(equalsRule())).toBe(true));
  it('invalid between', () => expect(isRuleValid({ fieldId: 'a', op: 'between', value: [1, 0], visualization: 'bar' })).toBe(false));
  it('invalid gt', () => expect(isRuleValid({ fieldId: 'a', op: 'gt', value: 'x', visualization: 'bar' })).toBe(false));
  it('empty fieldId', () => expect(isRuleValid({ fieldId: '', op: 'equals', value: 1, visualization: 'color' })).toBe(false));
});

describe('view-conditional-format-engine.filterValid', () => {
  it('drops invalid', () => {
    const out = filterValid([equalsRule(), { fieldId: '', op: 'equals', value: 1, visualization: 'color' }]);
    expect(out.length).toBe(1);
  });
});