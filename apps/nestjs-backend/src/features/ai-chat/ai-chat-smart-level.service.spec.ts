/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatSmartLevelService } from './ai-chat-smart-level.service';

describe('AiChatSmartLevelService (Stage 54)', () => {
  let svc: AiChatSmartLevelService;

  beforeEach(() => {
    svc = new AiChatSmartLevelService();
  });

  it('resolve returns override when valid', async () => {
    expect(await svc.resolve('low')).toBe('low');
    expect(await svc.resolve('high')).toBe('high');
  });

  it('resolve ignores invalid override', async () => {
    expect(await svc.resolve('nonsense' as never)).toBe('medium');
    expect(await svc.resolve(undefined)).toBe('medium');
  });

  it('resolve falls back to aiSetting.load().defaultSmartLevel', async () => {
    const aiSetting = { load: vi.fn(async () => ({ defaultSmartLevel: 'high' })) } as never;
    const svcWithSetting = new AiChatSmartLevelService(aiSetting);
    expect(await svcWithSetting.resolve()).toBe('high');
    expect(aiSetting.load).toHaveBeenCalledTimes(1);
  });

  it('resolve falls back to medium when aiSetting.load throws', async () => {
    const aiSetting = {
      load: vi.fn(async () => {
        throw new Error('db down');
      }),
    } as never;
    const svcWithSetting = new AiChatSmartLevelService(aiSetting);
    expect(await svcWithSetting.resolve()).toBe('medium');
  });

  it('resolve tolerates aiSetting with missing defaultSmartLevel', async () => {
    const aiSetting = { load: vi.fn(async () => ({})) } as never;
    const svcWithSetting = new AiChatSmartLevelService(aiSetting);
    expect(await svcWithSetting.resolve()).toBe('medium');
  });

  it('override beats aiSetting value', async () => {
    const aiSetting = { load: vi.fn(async () => ({ defaultSmartLevel: 'high' })) } as never;
    const svcWithSetting = new AiChatSmartLevelService(aiSetting);
    expect(await svcWithSetting.resolve('low')).toBe('low');
  });

  it('render returns non-empty string for every level', () => {
    expect(svc.render('low')).toContain('LOW');
    expect(svc.render('medium')).toContain('MEDIUM');
    expect(svc.render('high')).toContain('HIGH');
  });

  it('render mentions step-by-step for medium', () => {
    expect(svc.render('medium')).toMatch(/step by step/i);
  });

  it('render mentions alternatives for high', () => {
    expect(svc.render('high')).toMatch(/alternatives/i);
  });

  it('render for low emphasizes brevity', () => {
    expect(svc.render('low')).toMatch(/shortest/i);
  });
});
