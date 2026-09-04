/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-2: AiChatIntelligenceService — 8 unit tests.
 *
 *   1. unknown session → 404
 *   2. caller is not owner → 404
 *   3. updateIntelligence rejects invalid smartLevel
 *   4. updateIntelligence persists level + model
 *   5. updateIntelligence with smartLevel=null clears the override
 *   6. getEffective resolves global fallback when session overrides are null
 *   7. TOOL_PERMISSIONS: low=read-only, medium=+comment, high=+write
 *   8. SMART_LEVEL_TOKEN_BUDGET mapping (4K / 16K / 64K)
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiChatIntelligenceService,
  SMART_LEVEL_TOKEN_BUDGET,
  TOOL_PERMISSIONS,
} from './ai-chat-intelligence.service';
import { AiChatSmartLevelService } from './ai-chat-smart-level.service';

const SESSION_ID = 'sess_1';
const USER_ID = 'user_1';

type PrismaDelegate = Record<string, ReturnType<typeof vi.fn>>;

function createPrismaStub() {
  return {
    aiChatSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    } as PrismaDelegate,
  } as unknown as { aiChatSession: PrismaDelegate };
}

function createAiSettingStub() {
  return {
    load: vi.fn(),
  };
}

function createSmartLevelStub() {
  return {} as AiChatSmartLevelService;
}

describe('AiChatIntelligenceService (R-CHAT-2)', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let aiSetting: ReturnType<typeof createAiSettingStub>;
  let smart: AiChatSmartLevelService;
  let svc: AiChatIntelligenceService;

  beforeEach(() => {
    prisma = createPrismaStub();
    aiSetting = createAiSettingStub();
    smart = createSmartLevelStub();
    svc = new AiChatIntelligenceService(
      prisma as never,
      smart,
      aiSetting as never
    );
  });

  it('rejects unknown session with NotFoundException', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValue(null);
    await expect(
      svc.updateIntelligence({ sessionId: SESSION_ID, userId: USER_ID, smartLevel: 'high' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when caller is not session owner', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      createdBy: 'someone-else',
      smartLevel: null,
      model: null,
    });
    await expect(
      svc.updateIntelligence({ sessionId: SESSION_ID, userId: USER_ID, smartLevel: 'low' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid smartLevel with BadRequestException', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      createdBy: USER_ID,
      smartLevel: null,
      model: null,
    });
    await expect(
      svc.updateIntelligence({
        sessionId: SESSION_ID,
        userId: USER_ID,
        smartLevel: 'turbo' as never,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateIntelligence persists level + model', async () => {
    prisma.aiChatSession.findUnique
      .mockResolvedValueOnce({
        id: SESSION_ID,
        createdBy: USER_ID,
        smartLevel: null,
        model: null,
      })
      .mockResolvedValueOnce({
        id: SESSION_ID,
        createdBy: USER_ID,
        smartLevel: 'high',
        model: 'claude-3-5-sonnet',
      });
    prisma.aiChatSession.update.mockResolvedValue({});
    aiSetting.load.mockResolvedValue({ defaultSmartLevel: 'medium', defaultModel: 'gpt-4o-mini' });
    const snap = await svc.updateIntelligence({
      sessionId: SESSION_ID,
      userId: USER_ID,
      smartLevel: 'high',
      model: 'claude-3-5-sonnet',
    });
    expect(prisma.aiChatSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: expect.objectContaining({
        smartLevel: 'high',
        model: 'claude-3-5-sonnet',
      }),
    });
    expect(snap.effectiveSmartLevel).toBe('high');
    expect(snap.effectiveModel).toBe('claude-3-5-sonnet');
  });

  it('updateIntelligence with smartLevel=null clears the override (inherits global)', async () => {
    prisma.aiChatSession.findUnique
      .mockResolvedValueOnce({
        id: SESSION_ID,
        createdBy: USER_ID,
        smartLevel: 'high', // pre-existing override
        model: null,
      })
      .mockResolvedValueOnce({
        id: SESSION_ID,
        createdBy: USER_ID,
        smartLevel: null, // post-clear session
        model: null,
      });
    prisma.aiChatSession.update.mockResolvedValue({});
    aiSetting.load.mockResolvedValue({ defaultSmartLevel: 'medium', defaultModel: 'gpt-4o-mini' });
    const snap = await svc.updateIntelligence({
      sessionId: SESSION_ID,
      userId: USER_ID,
      smartLevel: null,
    });
    expect(prisma.aiChatSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: expect.objectContaining({ smartLevel: null }),
    });
    expect(snap.smartLevel).toBeNull();
    expect(snap.effectiveSmartLevel).toBe('medium'); // global default
  });

  it('getEffective resolves global fallback when session overrides are null', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      createdBy: USER_ID,
      smartLevel: null,
      model: null,
    });
    aiSetting.load.mockResolvedValue({
      defaultSmartLevel: 'low',
      defaultModel: 'gpt-4o-mini',
    });
    const snap = await svc.getEffective({
      id: SESSION_ID,
      smartLevel: null,
      model: null,
    });
    expect(snap.effectiveSmartLevel).toBe('low');
    expect(snap.effectiveModel).toBe('gpt-4o-mini');
    expect(snap.inheritedFromGlobal).toEqual({
      smartLevel: 'low',
      model: 'gpt-4o-mini',
    });
    expect(snap.tokenBudget).toBe(SMART_LEVEL_TOKEN_BUDGET.low);
    expect(snap.allowedTools).toEqual(TOOL_PERMISSIONS.low);
  });

  it('TOOL_PERMISSIONS: low=read-only, medium=+comment, high=+write', () => {
    expect(TOOL_PERMISSIONS.low).toEqual(
      expect.arrayContaining(['table.read', 'view.read', 'field.read', 'record.read'])
    );
    expect(TOOL_PERMISSIONS.low).not.toEqual(expect.arrayContaining(['record.create']));

    expect(TOOL_PERMISSIONS.medium).toEqual(
      expect.arrayContaining(['record.comment'])
    );
    expect(TOOL_PERMISSIONS.medium).not.toEqual(expect.arrayContaining(['record.create']));

    expect(TOOL_PERMISSIONS.high).toEqual(expect.arrayContaining(['record.create']));
    expect(TOOL_PERMISSIONS.high.length).toBeGreaterThan(TOOL_PERMISSIONS.medium.length);
  });

  it('SMART_LEVEL_TOKEN_BUDGET maps low=4K, medium=16K, high=64K', () => {
    expect(SMART_LEVEL_TOKEN_BUDGET.low).toBe(4_000);
    expect(SMART_LEVEL_TOKEN_BUDGET.medium).toBe(16_000);
    expect(SMART_LEVEL_TOKEN_BUDGET.high).toBe(64_000);
  });
});
