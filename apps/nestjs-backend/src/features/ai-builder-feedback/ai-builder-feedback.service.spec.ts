/* eslint-disable @typescript-eslint/naming-convention */
import type { IBuilderProposal } from '../ai-builder/ai-builder.types';
import {
  aggregateBucket,
  applyFeedbackToPrompt,
  buildFeedbackRow,
  buildTemplateId,
  computeEditDiff,
  diffToSignatures,
  groupByModelEntityType,
  isScoreImprovement,
  isTrusted,
  metricToTemplateScore,
  outcomeFromStatus,
  pickPreferredModel,
  rankMetrics,
  summarize,
} from './ai-builder-feedback.service';
import type { IAiBuilderFeedbackMetrics, IProposalFeedback } from './ai-builder-feedback.types';

const baseProposal = (over: Partial<IBuilderProposal> = {}): IBuilderProposal => ({
  entityType: 'table',
  title: 'Tasks',
  rationale: 'r',
  confidence: 0.7,
  payload: {
    name: 'tasks',
    primaryFieldName: 'title',
    fields: [
      { name: 'title', type: 'singleLineText', required: true },
      { name: 'status', type: 'singleSelect', options: ['todo', 'doing', 'done'] },
      { name: 'priority', type: 'singleSelect', options: ['low', 'med', 'high'] },
    ],
  },
  ...over,
});

const fb = (over: Partial<IProposalFeedback> = {}): IProposalFeedback => ({
  proposalId: 'p1',
  baseId: 'b1',
  model: 'gpt-4o',
  entityType: 'table',
  outcome: 'accepted',
  editMagnitude: 0,
  recordedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('ai-builder-feedback.outcomeFromStatus', () => {
  it('maps applied → accepted', () => {
    expect(outcomeFromStatus('applied', false)).toBe('accepted');
  });
  it('maps rejected → rejected', () => {
    expect(outcomeFromStatus('rejected', false)).toBe('rejected');
  });
  it('maps approved + edited → edited', () => {
    expect(outcomeFromStatus('approved', true)).toBe('edited');
  });
  it('maps approved → accepted', () => {
    expect(outcomeFromStatus('approved', false)).toBe('accepted');
  });
  it('maps draft → ignored', () => {
    expect(outcomeFromStatus('draft', false)).toBe('ignored');
  });
});

describe('ai-builder-feedback.buildFeedbackRow', () => {
  it('clears editMagnitude when not edited', () => {
    const row = buildFeedbackRow({
      proposalId: 'p1',
      baseId: 'b1',
      model: 'gpt-4o',
      entityType: 'table',
      status: 'applied',
      edited: false,
      editMagnitude: 0.7,
    });
    expect(row.outcome).toBe('accepted');
    expect(row.editMagnitude).toBe(0);
  });
  it('preserves editMagnitude when edited', () => {
    const row = buildFeedbackRow({
      proposalId: 'p1',
      baseId: 'b1',
      model: 'gpt-4o',
      entityType: 'table',
      status: 'approved',
      edited: true,
      editMagnitude: 0.4,
    });
    expect(row.outcome).toBe('edited');
    expect(row.editMagnitude).toBe(0.4);
  });
  it('clamps editMagnitude above 1', () => {
    const row = buildFeedbackRow({
      proposalId: 'p1',
      baseId: 'b1',
      model: 'gpt-4o',
      entityType: 'table',
      status: 'approved',
      edited: true,
      editMagnitude: 2.5,
    });
    expect(row.editMagnitude).toBe(1);
  });
});

describe('ai-builder-feedback.computeEditDiff', () => {
  it('detects a renamed field', () => {
    const edited = baseProposal({
      payload: {
        name: 'tasks',
        primaryFieldName: 'title',
        fields: [
          { name: 'summary', type: 'singleLineText', required: true },
          { name: 'status', type: 'singleSelect', options: ['todo', 'doing', 'done'] },
          { name: 'priority', type: 'singleSelect', options: ['low', 'med', 'high'] },
        ],
      },
    });
    const diff = computeEditDiff(baseProposal(), edited);
    expect(diff.renamed).toBe(1);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });
  it('detects a retyped field', () => {
    const edited = baseProposal({
      payload: {
        name: 'tasks',
        primaryFieldName: 'title',
        fields: [
          { name: 'title', type: 'longText', required: true },
          { name: 'status', type: 'singleSelect', options: ['todo', 'doing', 'done'] },
          { name: 'priority', type: 'singleSelect', options: ['low', 'med', 'high'] },
        ],
      },
    });
    const diff = computeEditDiff(baseProposal(), edited);
    expect(diff.retype).toBe(1);
    expect(diff.renamed).toBe(0);
  });
  it('detects added and removed fields', () => {
    const edited = baseProposal({
      payload: {
        name: 'tasks',
        primaryFieldName: 'title',
        fields: [
          { name: 'title', type: 'singleLineText', required: true },
          { name: 'status', type: 'singleSelect', options: ['todo', 'doing', 'done'] },
          { name: 'due_date', type: 'date' },
          { name: 'extra', type: 'longText' },
        ],
      },
    });
    const diff = computeEditDiff(baseProposal(), edited);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
  });
  it('returns 0 magnitude when identical', () => {
    const diff = computeEditDiff(baseProposal(), baseProposal());
    expect(diff.magnitude).toBe(0);
  });
  it('handles view proposals', () => {
    const diff = computeEditDiff(
      { ...baseProposal({ entityType: 'view' }), payload: { name: 'v1', type: 'grid' } },
      { ...baseProposal({ entityType: 'view' }), payload: { name: 'v1', type: 'kanban' } }
    );
    expect(diff.retype).toBe(1);
    expect(diff.magnitude).toBeGreaterThan(0);
  });
  it('handles field proposals', () => {
    const diff = computeEditDiff(
      { ...baseProposal({ entityType: 'field' }), payload: { name: 'x', type: 'singleLineText' } },
      { ...baseProposal({ entityType: 'field' }), payload: { name: 'y', type: 'singleLineText' } }
    );
    expect(diff.renamed).toBe(1);
  });
});

describe('ai-builder-feedback.diffToSignatures', () => {
  it('emits one signature per change kind', () => {
    const sigs = diffToSignatures({
      added: 1,
      removed: 0,
      renamed: 1,
      retype: 0,
      totalFields: 3,
      magnitude: 0.3,
    });
    expect(sigs.find((s) => s.kind === 'rename-field')).toBeDefined();
    expect(sigs.find((s) => s.kind === 'add-field')).toBeDefined();
    expect(sigs.find((s) => s.kind === 'retype-field')).toBeUndefined();
  });
  it('falls back to other when no changes', () => {
    const sigs = diffToSignatures({
      added: 0,
      removed: 0,
      renamed: 0,
      retype: 0,
      totalFields: 3,
      magnitude: 0,
    });
    expect(sigs[0]?.kind).toBe('other');
  });
});

describe('ai-builder-feedback.groupByModelEntityType', () => {
  it('partitions rows by model and entityType', () => {
    const rows = [
      fb({ model: 'a', entityType: 'table' }),
      fb({ model: 'a', entityType: 'table', proposalId: 'p2' }),
      fb({ model: 'a', entityType: 'view', proposalId: 'p3' }),
      fb({ model: 'b', entityType: 'table', proposalId: 'p4' }),
    ];
    const g = groupByModelEntityType(rows);
    expect(g.size).toBe(3);
    expect(g.get('a|table')?.length).toBe(2);
    expect(g.get('a|view')?.length).toBe(1);
    expect(g.get('b|table')?.length).toBe(1);
  });
});

describe('ai-builder-feedback.aggregateBucket', () => {
  it('counts each outcome', () => {
    const rows = [
      fb({ outcome: 'accepted' }),
      fb({ outcome: 'accepted', proposalId: 'p2' }),
      fb({ outcome: 'rejected', proposalId: 'p3' }),
      fb({ outcome: 'edited', editMagnitude: 0.4, proposalId: 'p4' }),
      fb({ outcome: 'ignored', proposalId: 'p5' }),
    ];
    const m = aggregateBucket('gpt-4o', 'table', rows);
    expect(m.total).toBe(5);
    expect(m.accepted).toBe(2);
    expect(m.rejected).toBe(1);
    expect(m.edited).toBe(1);
    expect(m.ignored).toBe(1);
    expect(m.acceptanceRate).toBe(3 / 4);
    expect(m.acceptanceRate).toBe(0.75);
    expect(m.meanEditMagnitude).toBeCloseTo(0.4);
  });
  it('returns zeros when bucket is empty', () => {
    const m = aggregateBucket('gpt-4o', 'table', []);
    expect(m.acceptanceRate).toBe(0);
    expect(m.score).toBe(0);
  });
  it('penalises high edit magnitudes in the score', () => {
    const clean = aggregateBucket('gpt-4o', 'table', [
      fb({ outcome: 'accepted' }),
      fb({ outcome: 'accepted', proposalId: 'p2' }),
      fb({ outcome: 'accepted', proposalId: 'p3' }),
      fb({ outcome: 'accepted', proposalId: 'p4' }),
    ]);
    const messy = aggregateBucket('gpt-4o', 'table', [
      fb({ outcome: 'edited', editMagnitude: 0.9, proposalId: 'p2' }),
      fb({ outcome: 'edited', editMagnitude: 0.9, proposalId: 'p3' }),
      fb({ outcome: 'accepted', proposalId: 'p4' }),
      fb({ outcome: 'accepted', proposalId: 'p5' }),
    ]);
    expect(clean.score).toBeGreaterThan(messy.score);
  });
});

describe('ai-builder-feedback.isTrusted', () => {
  it('requires the configured min sample size', () => {
    const m: IAiBuilderFeedbackMetrics = {
      model: 'gpt-4o',
      entityType: 'table',
      total: 4,
      accepted: 4,
      rejected: 0,
      edited: 0,
      ignored: 0,
      acceptanceRate: 1,
      meanEditMagnitude: 0,
      score: 1,
    };
    expect(isTrusted(m, { minSampleSize: 5 })).toBe(false);
    expect(isTrusted(m, { minSampleSize: 4 })).toBe(true);
  });
});

describe('ai-builder-feedback.rankMetrics', () => {
  it('sorts by score desc, then model asc, then entityType asc', () => {
    const a: IAiBuilderFeedbackMetrics = {
      model: 'a',
      entityType: 'view',
      total: 10,
      accepted: 10,
      rejected: 0,
      edited: 0,
      ignored: 0,
      acceptanceRate: 1,
      meanEditMagnitude: 0,
      score: 1,
    };
    const b: IAiBuilderFeedbackMetrics = {
      ...a,
      model: 'a',
      entityType: 'table',
      score: 1,
    };
    const c: IAiBuilderFeedbackMetrics = { ...a, model: 'b', score: 0.5 };
    const ranked = rankMetrics([c, b, a]);
    expect(ranked[0]).toBe(b);
    expect(ranked[1]).toBe(a);
    expect(ranked[2]).toBe(c);
  });
});

describe('ai-builder-feedback.summarize', () => {
  it('filters by base and ranks metrics', () => {
    const rows = [
      fb({ baseId: 'b1', model: 'a', entityType: 'table' }),
      fb({ baseId: 'b1', model: 'a', entityType: 'table', proposalId: 'p2', outcome: 'rejected' }),
      fb({ baseId: 'b1', model: 'a', entityType: 'table', proposalId: 'p3', outcome: 'accepted' }),
      fb({ baseId: 'b1', model: 'a', entityType: 'table', proposalId: 'p4', outcome: 'accepted' }),
      fb({ baseId: 'b1', model: 'a', entityType: 'table', proposalId: 'p5', outcome: 'accepted' }),
      fb({ baseId: 'b1', model: 'a', entityType: 'view', proposalId: 'p6' }),
      fb({ baseId: 'b2', model: 'a', entityType: 'table', proposalId: 'p7' }),
    ];
    const s = summarize('b1', rows, { minSampleSize: 1 });
    expect(s.metrics.length).toBe(2);
    expect(s.totalsByModel['a']).toBe(6);
  });
});

describe('ai-builder-feedback.pickPreferredModel', () => {
  it('returns the top trusted model for the entityType', () => {
    const a: IAiBuilderFeedbackMetrics = {
      model: 'a',
      entityType: 'table',
      total: 10,
      accepted: 9,
      rejected: 0,
      edited: 1,
      ignored: 0,
      acceptanceRate: 0.95,
      meanEditMagnitude: 0.1,
      score: 0.9,
    };
    const b: IAiBuilderFeedbackMetrics = { ...a, model: 'b', score: 0.5, total: 5 };
    expect(pickPreferredModel([b, a], 'table')).toBe('a');
  });
  it('returns null when nothing is trusted', () => {
    const a: IAiBuilderFeedbackMetrics = {
      model: 'a',
      entityType: 'table',
      total: 1,
      accepted: 1,
      rejected: 0,
      edited: 0,
      ignored: 0,
      acceptanceRate: 1,
      meanEditMagnitude: 0,
      score: 1,
    };
    expect(pickPreferredModel([a], 'table', { minSampleSize: 5 })).toBeNull();
  });
});

describe('ai-builder-feedback.metricToTemplateScore', () => {
  it('maps metric to template score', () => {
    const m: IAiBuilderFeedbackMetrics = {
      model: 'a',
      entityType: 'table',
      total: 10,
      accepted: 8,
      rejected: 1,
      edited: 1,
      ignored: 0,
      acceptanceRate: 0.9,
      meanEditMagnitude: 0.2,
      score: 0.8,
    };
    const t = metricToTemplateScore('a::table', m);
    expect(t.templateId).toBe('a::table');
    expect(t.score).toBe(0.8);
    expect(t.sampleSize).toBe(10);
  });
});

describe('ai-builder-feedback.isScoreImprovement', () => {
  it('improvement when there was no previous score', () => {
    expect(
      isScoreImprovement(null, {
        templateId: 'a',
        model: 'a',
        entityType: 'table',
        score: 0.5,
        sampleSize: 1,
        updatedAt: '',
      })
    ).toBe(true);
  });
  it('improvement when score crosses the 0.05 threshold', () => {
    expect(
      isScoreImprovement(
        {
          templateId: 'a',
          model: 'a',
          entityType: 'table',
          score: 0.5,
          sampleSize: 5,
          updatedAt: '',
        },
        {
          templateId: 'a',
          model: 'a',
          entityType: 'table',
          score: 0.6,
          sampleSize: 6,
          updatedAt: '',
        }
      )
    ).toBe(true);
  });
  it('not an improvement when score drops within tolerance', () => {
    expect(
      isScoreImprovement(
        {
          templateId: 'a',
          model: 'a',
          entityType: 'table',
          score: 0.5,
          sampleSize: 5,
          updatedAt: '',
        },
        {
          templateId: 'a',
          model: 'a',
          entityType: 'table',
          score: 0.51,
          sampleSize: 5,
          updatedAt: '',
        }
      )
    ).toBe(false);
  });
});

describe('ai-builder-feedback.applyFeedbackToPrompt', () => {
  it('returns base prompt when there is no preferred model', () => {
    expect(
      applyFeedbackToPrompt({ basePrompt: 'hi', preferredModel: null, entityType: 'table' })
    ).toBe('hi');
  });
  it('appends a hint when a preferred model exists', () => {
    const out = applyFeedbackToPrompt({
      basePrompt: 'hi',
      preferredModel: 'a',
      entityType: 'table',
    });
    expect(out).toContain('a');
    expect(out).toContain('table');
  });
  it('includes acceptance + edit magnitude when metrics are passed', () => {
    const m: IAiBuilderFeedbackMetrics = {
      model: 'a',
      entityType: 'table',
      total: 10,
      accepted: 8,
      rejected: 1,
      edited: 1,
      ignored: 0,
      acceptanceRate: 0.9,
      meanEditMagnitude: 0.2,
      score: 0.85,
    };
    const out = applyFeedbackToPrompt({
      basePrompt: 'hi',
      preferredModel: 'a',
      entityType: 'table',
      metrics: [m],
    });
    expect(out).toContain('90.0% acceptance');
    expect(out).toContain('20% mean edit magnitude');
  });
});

describe('ai-builder-feedback.buildTemplateId', () => {
  it('joins model and entityType', () => {
    expect(buildTemplateId('gpt-4o', 'table')).toBe('gpt-4o::table');
  });
});
