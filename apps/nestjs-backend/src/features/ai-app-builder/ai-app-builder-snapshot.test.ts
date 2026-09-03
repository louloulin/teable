/**
 * Snapshot normalizer tests (R57).
 *
 * Covers: legacy migration, path validation, file guards, error codes,
 * entry resolution, and convenience selectors.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultEntry,
  getEntryFile,
  getFileByPath,
  inferLanguage,
  migrateLegacySnapshot,
  normalizeSnapshot,
  normalizeSnapshotPath,
  SnapshotValidationError,
  totalSnapshotBytes,
  SNAPSHOT_MAX_FILE_BYTES,
  SNAPSHOT_MAX_FILES,
} from './ai-app-builder-snapshot';

describe('normalizeSnapshotPath', () => {
  it('rejects empty strings', () => {
    expect(() => normalizeSnapshotPath('')).toThrowError(SnapshotValidationError);
  });
  it('rejects absolute paths', () => {
    expect(() => normalizeSnapshotPath('/etc/passwd')).toThrowError(/path must be relative/);
  });
  it('rejects .. traversal', () => {
    expect(() => normalizeSnapshotPath('../escape.tsx')).toThrowError(/\.\./);
    expect(() => normalizeSnapshotPath('a/../../b')).toThrowError(/\.\./);
  });
  it('strips ./ segments and collapses //', () => {
    expect(normalizeSnapshotPath('./src//App.tsx')).toBe('src/App.tsx');
    expect(normalizeSnapshotPath('a/./b/./c.tsx')).toBe('a/b/c.tsx');
  });
  it('rejects null bytes', () => {
    expect(() => normalizeSnapshotPath('src/a\0.tsx')).toThrowError(/null byte/);
  });
});

describe('inferLanguage', () => {
  it('maps extensions correctly', () => {
    expect(inferLanguage('src/App.tsx')).toBe('tsx');
    expect(inferLanguage('Card.jsx')).toBe('jsx');
    expect(inferLanguage('index.html')).toBe('html');
    expect(inferLanguage('styles.css')).toBe('css');
    expect(inferLanguage('data.json')).toBe('json');
    expect(inferLanguage('README')).toBe('text');
  });
});

describe('normalizeSnapshot — empty / envelope / legacy', () => {
  it('returns empty envelope for null', () => {
    const env = normalizeSnapshot(null);
    expect(env.schema).toBe(1);
    expect(env.app.files).toEqual([]);
    expect(env.app.entry).toBe(defaultEntry());
  });
  it('rejects empty envelope when schema=1 is missing', () => {
    expect(() => normalizeSnapshot({})).toThrowError(/must be an envelope/);
  });
  it('accepts envelope shape', () => {
    const env = normalizeSnapshot({
      schema: 1,
      app: {
        files: [{ path: 'src/App.tsx', content: '<div/>', language: 'tsx' }],
        entry: 'src/App.tsx',
        tailwind: true,
      },
    });
    expect(env.app.tailwind).toBe(true);
    expect(env.app.files[0].content).toBe('<div/>');
  });
  it('rejects when files missing', () => {
    expect(() => normalizeSnapshot({ schema: 1, app: {} })).toThrowError(/files must be an array/);
  });
  it('rejects empty files', () => {
    expect(() => normalizeSnapshot({ schema: 1, app: { files: [] } })).toThrowError(/at least one file/);
  });
  it('rejects too many files', () => {
    const files = Array.from({ length: SNAPSHOT_MAX_FILES + 1 }, (_, i) => ({
      path: `f${i}.tsx`,
      content: 'x',
    }));
    expect(() => normalizeSnapshot({ schema: 1, app: { files } })).toThrowError(/exceeds max/);
  });
  it('rejects duplicate paths', () => {
    expect(() =>
      normalizeSnapshot({
        schema: 1,
        app: {
          files: [
            { path: 'a.tsx', content: 'x' },
            { path: 'a.tsx', content: 'y' },
          ],
        },
      })
    ).toThrowError(/duplicate file path/);
  });
  it('rejects when entry is missing', () => {
    expect(() =>
      normalizeSnapshot({
        schema: 1,
        app: { files: [{ path: 'src/Other.tsx', content: 'x' }] },
      })
    ).toThrowError(/entry file not present/);
  });
  it('rejects when explicit entry path is not present', () => {
    expect(() =>
      normalizeSnapshot({
        schema: 1,
        app: {
          files: [{ path: 'src/Other.tsx', content: 'x' }],
          entry: 'src/NotThere.tsx',
        },
      })
    ).toThrowError(/entry file not present/);
  });
  it('rejects content too large', () => {
    const big = 'x'.repeat(SNAPSHOT_MAX_FILE_BYTES + 1);
    expect(() =>
      normalizeSnapshot({
        schema: 1,
        app: { files: [{ path: 'src/App.tsx', content: big }] },
      })
    ).toThrowError(/exceeds/);
  });
});

describe('migrateLegacySnapshot', () => {
  it('migrates { files, components }', () => {
    const env = migrateLegacySnapshot({
      files: [{ path: 'src/App.tsx', content: '<div/>' }],
      components: [{ name: 'Card', source: 'export const Card = () => <div/>;' }],
    });
    expect(env.schema).toBe(1);
    expect(env.app.files.length).toBe(2);
    expect(env.app.files.find((f) => f.path === 'src/components/Card.tsx')).toBeTruthy();
  });
  it('skips malformed component entries', () => {
    const env = migrateLegacySnapshot({
      files: [{ path: 'src/App.tsx', content: 'x' }],
      components: [null, { name: '!@#' }, { name: 'OK' }],
    });
    expect(env.app.files.length).toBe(2); // App + OK
  });
});

describe('getEntryFile / getFileByPath / totalSnapshotBytes', () => {
  const env = normalizeSnapshot({
    schema: 1,
    app: {
      files: [
        { path: 'src/App.tsx', content: 'A' },
        { path: 'src/B.tsx', content: 'BB' },
      ],
      entry: 'src/App.tsx',
    },
  });

  it('returns entry file', () => {
    expect(getEntryFile(env)?.content).toBe('A');
  });
  it('returns file by path', () => {
    expect(getFileByPath(env, 'src/B.tsx')?.content).toBe('BB');
    expect(getFileByPath(env, '../escape')).toBeUndefined();
  });
  it('counts total UTF-8 bytes', () => {
    expect(totalSnapshotBytes(env)).toBe(3);
  });
});
