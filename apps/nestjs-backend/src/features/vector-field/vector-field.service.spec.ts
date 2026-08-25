/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildCollectionRow,
  buildRagPrompt,
  buildRecordRow,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  hashContent,
  isValidCollectionName,
  isValidDimensions,
  isValidMetric,
  runSimilaritySearch,
  score,
  search,
  trimHitContent,
  validateCreateCollection,
} from './vector-field.service';

describe('Vector field helpers (Stage 41)', () => {
  describe('validators', () => {
    it('isValidMetric accepts supported metrics', () => {
      expect(isValidMetric('cosine')).toBe(true);
      expect(isValidMetric('dotProduct')).toBe(true);
      expect(isValidMetric('euclidean')).toBe(true);
      expect(isValidMetric('mystery')).toBe(false);
    });
    it('isValidDimensions enforces integer bounds', () => {
      expect(isValidDimensions(8)).toBe(true);
      expect(isValidDimensions(4_096)).toBe(true);
      expect(isValidDimensions(0)).toBe(false);
      expect(isValidDimensions(8.5)).toBe(false);
    });
    it('isValidCollectionName rejects empty/symbol-rich names', () => {
      expect(isValidCollectionName('docs')).toBe(true);
      expect(isValidCollectionName('my collection-v2')).toBe(true);
      expect(isValidCollectionName('a')).toBe(false);
      expect(isValidCollectionName('with/slash')).toBe(false);
    });
  });

  describe('similarity primitives', () => {
    it('cosineSimilarity returns 1 for identical unit vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    });
    it('cosineSimilarity returns 0 for orthogonal', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });
    it('cosineSimilarity returns 0 for zero vector', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });
    it('cosineSimilarity throws on dimension mismatch', () => {
      expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
    });
    it('dotProduct sums element products', () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
    });
    it('euclideanDistance is 0 for identical', () => {
      expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
    });
    it('euclideanDistance computes hypotenuse', () => {
      expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5);
    });
  });

  describe('score dispatch', () => {
    it('cosine returns 1 for identical', () => {
      expect(score('cosine', [1, 0], [1, 0])).toBeCloseTo(1);
    });
    it('dotProduct returns 7 for [1,2]·[3,4]', () => {
      expect(score('dotProduct', [1, 2], [3, 4])).toBe(11);
    });
    it('euclidean returns negative distance (higher better)', () => {
      expect(score('euclidean', [0, 0], [3, 4])).toBeCloseTo(-5);
    });
  });

  describe('hashContent', () => {
    it('is stable for identical input', () => {
      expect(hashContent({ model: 'm', content: 'hello' })).toBe(
        hashContent({ model: 'm', content: 'hello' })
      );
    });
    it('changes when content changes', () => {
      expect(hashContent({ model: 'm', content: 'hello' })).not.toBe(
        hashContent({ model: 'm', content: 'helloo' })
      );
    });
    it('changes when model changes', () => {
      expect(hashContent({ model: 'm1', content: 'hello' })).not.toBe(
        hashContent({ model: 'm2', content: 'hello' })
      );
    });
  });

  describe('buildCollectionRow', () => {
    it('produces a row with default metric', () => {
      const r = buildCollectionRow({
        id: 'c1',
        baseId: 'b1',
        name: 'docs',
        dimensions: 8,
        createdBy: 'u1',
      });
      expect(r.metric).toBe('cosine');
      expect(r.status).toBe('building');
      expect(r.dimensions).toBe(8);
    });
    it('rejects invalid name', () => {
      expect(() =>
        buildCollectionRow({
          id: 'c1',
          baseId: 'b1',
          name: 'x',
          dimensions: 8,
          createdBy: 'u1',
        })
      ).toThrow();
    });
    it('rejects invalid dimensions', () => {
      expect(() =>
        buildCollectionRow({
          id: 'c1',
          baseId: 'b1',
          name: 'docs',
          dimensions: 0,
          createdBy: 'u1',
        })
      ).toThrow();
    });
  });

  describe('validateCreateCollection', () => {
    it('accepts valid', () => {
      expect(() =>
        validateCreateCollection({ baseId: 'b', name: 'docs', dimensions: 16, createdBy: 'u' })
      ).not.toThrow();
    });
    it('rejects invalid metric', () => {
      expect(() =>
        validateCreateCollection({
          baseId: 'b',
          name: 'docs',
          dimensions: 16,
          metric: 'mystery' as never,
          createdBy: 'u',
        })
      ).toThrow();
    });
  });

  describe('buildRecordRow', () => {
    it('produces a record with sha256 content hash', () => {
      const r = buildRecordRow({
        id: 'r',
        collectionId: 'c',
        sourceRef: 'tbl:1:f',
        embedding: [1, 0, 0],
        content: 'hello',
        model: 'm',
        dimensions: 3,
      });
      expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.embedding).toEqual([1, 0, 0]);
    });
    it('rejects mismatched embedding size', () => {
      expect(() =>
        buildRecordRow({
          id: 'r',
          collectionId: 'c',
          sourceRef: 'x',
          embedding: [1, 0],
          content: 'c',
          model: 'm',
          dimensions: 3,
        })
      ).toThrow();
    });
  });

  describe('runSimilaritySearch', () => {
    const records = [
      { id: 'a', sourceRef: 'a', embedding: [1, 0, 0], content: 'a' },
      { id: 'b', sourceRef: 'b', embedding: [0, 1, 0], content: 'b' },
      { id: 'c', sourceRef: 'c', embedding: [1, 1, 0], content: 'c' },
    ];
    it('ranks by cosine and trims to topK', () => {
      const out = runSimilaritySearch({
        metric: 'cosine',
        query: [1, 0, 0],
        records,
        topK: 2,
      });
      expect(out).toHaveLength(2);
      expect(out[0]!.recordId).toBe('a');
      expect(out[0]!.rank).toBe(1);
    });
    it('filters by minScore', () => {
      const out = runSimilaritySearch({
        metric: 'cosine',
        query: [1, 0, 0],
        records,
        topK: 5,
        minScore: 0.9,
      });
      expect(out.map((h) => h.recordId)).toEqual(['a']);
    });
  });

  describe('search wrapper', () => {
    it('returns ranked hits', () => {
      const records = [
        {
          id: 'x',
          collectionId: 'c',
          sourceRef: 's',
          embedding: [1, 0],
          content: 'x',
          contentHash: 'h',
          createdTime: new Date(),
        },
      ];
      const out = search({ collectionId: 'c', queryEmbedding: [1, 0], topK: 3 }, records, 'cosine');
      expect(out[0]!.score).toBeCloseTo(1);
    });
  });

  describe('trimHitContent', () => {
    it('passes short content through', () => {
      expect(trimHitContent('hi', 100)).toBe('hi');
    });
    it('truncates long content with ellipsis', () => {
      const out = trimHitContent('a'.repeat(200), 10);
      expect(out.length).toBeLessThanOrEqual(10);
      expect(out.endsWith('…')).toBe(true);
    });
  });

  describe('buildRagPrompt', () => {
    it('combines hits + question with separators', () => {
      const out = buildRagPrompt({
        query: 'Q',
        hits: [
          { recordId: 'r1', sourceRef: 't:1:f', score: 0.9, content: 'first' },
          { recordId: 'r2', sourceRef: 't:2:f', score: 0.8, content: 'second' },
        ],
      });
      expect(out).toContain('Question: Q');
      expect(out).toContain('[#1 score=0.900');
      expect(out).toContain('[#2 score=0.800');
      expect(out).toContain('---');
    });
  });
});
