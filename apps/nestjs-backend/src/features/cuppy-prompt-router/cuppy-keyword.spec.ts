import { describe, expect, it } from 'vitest';
import { classifyKeyword } from './cuppy-prompt-router';

describe('classifyKeyword — data_analysis', () => {
  it('detects Chinese analyze keywords', () => {
    expect(classifyKeyword('分析一下每个区域的销售总额').intent).toBe('data_analysis');
    expect(classifyKeyword('统计本月活跃用户数').intent).toBe('data_analysis');
    expect(classifyKeyword('计算平均客单价').intent).toBe('data_analysis');
    expect(classifyKeyword('给我画一个趋势图表').intent).toBe('data_analysis');
  });
  it('detects English analyze keywords', () => {
    expect(classifyKeyword('analyze the latest orders').intent).toBe('data_analysis');
    expect(classifyKeyword('show me a chart of revenue').intent).toBe('data_analysis');
    expect(classifyKeyword('what is the average order value?').intent).toBe('data_analysis');
  });
  it('still routes create/lookup correctly', () => {
    expect(classifyKeyword('create a new row').intent).toBe('record_create');
    expect(classifyKeyword('find record by id').intent).toBe('record_lookup');
    expect(classifyKeyword('trigger automation').intent).toBe('automation_trigger');
  });
});
