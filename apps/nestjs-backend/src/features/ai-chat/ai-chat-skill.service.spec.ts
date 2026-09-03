/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatSkillService } from './ai-chat-skill.service';

function buildContext(rendered: string | null) {
  return {
    resolve: vi.fn(async () =>
      rendered
        ? {
            tableId: 'tblX',
            viewId: 'viw1',
            tableName: 'Tasks',
            fields: [{ id: 'fldTitle', name: 'Title', type: 'singleLineText' }],
            rows: [],
            rowCount: 0,
          }
        : null
    ),
    render: vi.fn(() => rendered ?? ''),
  };
}

function buildPrisma(tables: Array<{ id: string; name: string; fieldCount: number }>) {
  return {
    tableMeta: {
      findMany: vi.fn(async () =>
        tables.map((t) => ({ id: t.id, name: t.name, _count: { fields: t.fieldCount } }))
      ),
    },
  };
}

describe('AiChatSkillService (Stage 38)', () => {
  describe('listSkills', () => {
    it('returns 3 built-in skills', () => {
      const svc = new AiChatSkillService();
      const skills = svc.listSkills();
      expect(skills.length).toBe(3);
      expect(skills.map((s) => s.name)).toEqual(['base', 'table', 'record']);
    });
  });

  describe('match', () => {
    let svc: AiChatSkillService;
    beforeEach(() => {
      svc = new AiChatSkillService();
    });

    it('returns null when no skill prefix', () => {
      expect(svc.match('What is the weather today?')).toBeNull();
    });

    it('matches @table and strips the prefix', () => {
      const r = svc.match('@table  describe this schema');
      expect(r?.skill.name).toBe('table');
      expect(r?.remainder).toBe('describe this schema');
    });

    it('matches @BASE case-insensitively', () => {
      const r = svc.match('@BASE summarize');
      expect(r?.skill.name).toBe('base');
      expect(r?.remainder).toBe('summarize');
    });

    it('returns null for unknown skill', () => {
      expect(svc.match('@unknown hello')).toBeNull();
    });

    it('only matches at start of message', () => {
      expect(svc.match('Please @table describe')).toBeNull();
    });
  });

  describe('buildPrompt', () => {
    it('@table returns a system prompt built from context service', async () => {
      const ctx = buildContext('Table: Tasks (tblX)\nFields:\n  - Title');
      const svc = new AiChatSkillService(ctx as never);
      const skill = svc.listSkills().find((s) => s.name === 'table')!;
      const prompt = await svc.buildPrompt({
        skill,
        remainder: 'describe',
        session: { baseId: 'bse1', tableId: 'tblX', viewId: 'viw1' },
      });
      expect(prompt).toContain('Table: Tasks (tblX)');
      expect(prompt).toContain('one-sentence summary');
    });

    it('@base returns base summary when prisma resolves tables', async () => {
      const prisma = buildPrisma([
        { id: 'tblA', name: 'Tasks', fieldCount: 5 },
        { id: 'tblB', name: 'Notes', fieldCount: 3 },
      ]);
      const svc = new AiChatSkillService(undefined, prisma as never);
      const skill = svc.listSkills().find((s) => s.name === 'base')!;
      const prompt = await svc.buildPrompt({
        skill,
        remainder: '',
        session: { baseId: 'bse1', tableId: null, viewId: null },
      });
      expect(prompt).toContain('2 table(s)');
      expect(prompt).toContain('Tasks');
      expect(prompt).toContain('Notes');
    });

    it('@base returns empty string when baseId is missing', async () => {
      const svc = new AiChatSkillService();
      const skill = svc.listSkills().find((s) => s.name === 'base')!;
      const prompt = await svc.buildPrompt({
        skill,
        remainder: '',
        session: { baseId: null, tableId: null, viewId: null },
      });
      expect(prompt).toBe('');
    });

    it('@record extracts recId from the remainder', async () => {
      const svc = new AiChatSkillService();
      const skill = svc.listSkills().find((s) => s.name === 'record')!;
      const prompt = await svc.buildPrompt({
        skill,
        remainder: 'explain rec1234567890abcdef',
        session: { baseId: null, tableId: 'tblX', viewId: null },
      });
      expect(prompt).toContain('rec1234567890abcdef');
      expect(prompt).toContain('tblX');
    });

    it('@record returns empty when no recId is present', async () => {
      const svc = new AiChatSkillService();
      const skill = svc.listSkills().find((s) => s.name === 'record')!;
      const prompt = await svc.buildPrompt({
        skill,
        remainder: 'no id here',
        session: { baseId: null, tableId: 'tblX', viewId: null },
      });
      expect(prompt).toBe('');
    });

    it('returns empty for unknown skill name', async () => {
      const svc = new AiChatSkillService();
      const prompt = await svc.buildPrompt({
        skill: { name: 'unknown', title: 'X', description: 'Y', tags: [] },
        remainder: '',
        session: { baseId: 'bse1', tableId: 'tblX', viewId: null },
      });
      expect(prompt).toBe('');
    });
  });
});
