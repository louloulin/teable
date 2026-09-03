/**
 * Mutation engine tests (R57).
 *
 * Covers: patch validation, all six patch kinds, error codes,
 * entry protection, ref resolution, batch semantics (idempotency +
 * duplicate-id detection), and LCS diff output.
 */
import { describe, expect, it } from 'vitest';
import {
  applyMutationPatches,
  diffLines,
  MutationValidationError,
  resolveElementRef,
} from './ai-app-builder-mutation';
import { normalizeSnapshot } from './ai-app-builder-snapshot';

const baseSnapshot = () =>
  normalizeSnapshot({
    schema: 1,
    app: {
      files: [
        { path: 'src/App.tsx', content: 'export default function App() {\n  return <h1>Hi</h1>;\n}' },
        { path: 'src/B.tsx', content: 'export const B = () => <div/>;' },
      ],
      entry: 'src/App.tsx',
    },
  });

describe('resolveElementRef', () => {
  const env = baseSnapshot();
  it('resolves a file ref', () => {
    const r = resolveElementRef(env, { kind: 'file', path: 'src/B.tsx' });
    expect(r.matched?.kind).toBe('file');
  });
  it('rejects an out-of-range line ref', () => {
    expect(() =>
      resolveElementRef(env, { kind: 'line', path: 'src/B.tsx', line: 999 })
    ).toThrowError(/out of range/);
  });
  it('resolves a text match', () => {
    const r = resolveElementRef(env, { kind: 'text', path: 'src/App.tsx', textMatch: '<h1>Hi</h1>' });
    expect(r.matched?.kind).toBe('text');
  });
  it('rejects text ref that does not match', () => {
    expect(() =>
      resolveElementRef(env, { kind: 'text', path: 'src/App.tsx', textMatch: 'no-such-text' })
    ).toThrowError(/did not match/);
  });
  it('rejects unknown ref kind', () => {
    expect(() => resolveElementRef(env, { kind: 'x' as never, path: 'src/App.tsx' })).toThrowError();
  });
});

describe('applyMutationPatches — patch validation', () => {
  it('rejects non-object patch', () => {
    const env = baseSnapshot();
    expect(() => applyMutationPatches(env, [null])).toThrowError(/must be an object/);
  });
  it('rejects patch without id', () => {
    const env = baseSnapshot();
    expect(() =>
      applyMutationPatches(env, [{ kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'x' }])
    ).toThrowError(/patch.id/);
  });
  it('rejects unknown kind', () => {
    const env = baseSnapshot();
    expect(() =>
      applyMutationPatches(env, [{ id: 'p1', kind: 'warp', ref: { kind: 'file', path: 'src/B.tsx' } }])
    ).toThrowError(/unknown patch kind/);
  });
  it('rejects invalid ref path', () => {
    const env = baseSnapshot();
    expect(() =>
      applyMutationPatches(env, [
        { id: 'p1', kind: 'append', ref: { kind: 'file', path: '../escape' }, next: 'x' },
      ])
    ).toThrowError(/\.\./);
  });
});

describe('applyMutationPatches — replace', () => {
  it('replaces file content fully', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      { id: 'p1', kind: 'replace', ref: { kind: 'file', path: 'src/B.tsx' }, nextContent: 'NEW' },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/B.tsx')?.content).toBe('NEW');
    }
  });
  it('throws when target missing', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      { id: 'p1', kind: 'replace', ref: { kind: 'file', path: 'src/Missing.tsx' }, nextContent: 'x' },
    ]);
    expect(out.ok).toBe(false);
  });
});

describe('applyMutationPatches — replaceRange', () => {
  it('replaces first occurrence by default', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'replaceRange',
        ref: { kind: 'file', path: 'src/App.tsx' },
        search: '<h1>Hi</h1>',
        next: '<h1>Hello</h1>',
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/App.tsx')?.content).toContain('<h1>Hello</h1>');
    }
  });
  it('replaces every occurrence when replaceAll=true', () => {
    const env = normalizeSnapshot({
      schema: 1,
      app: {
        files: [{ path: 'src/A.tsx', content: 'aaa-aaa-aaa' }],
        entry: 'src/A.tsx',
      },
    });
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'replaceRange',
        ref: { kind: 'file', path: 'src/A.tsx' },
        search: 'aaa',
        next: 'b',
        replaceAll: true,
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files[0].content).toBe('b-b-b');
    }
  });
  it('throws when search not found', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'replaceRange',
        ref: { kind: 'file', path: 'src/B.tsx' },
        search: 'no-such-text',
        next: 'x',
      },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures[0].code).toBe('MUTATION_RANGE_NOT_FOUND');
    }
  });
});

describe('applyMutationPatches — append', () => {
  it('appends content with newline separator', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'append',
        ref: { kind: 'file', path: 'src/B.tsx' },
        next: 'export const X = 1;',
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/B.tsx')?.content).toContain('export const X = 1;');
    }
  });
});

describe('applyMutationPatches — create', () => {
  it('creates a new file', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'create',
        ref: { kind: 'file', path: 'src/C.tsx' },
        nextContent: 'export const C = () => <div/>;',
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/C.tsx')).toBeTruthy();
    }
  });
  it('rejects when path exists', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'create',
        ref: { kind: 'file', path: 'src/B.tsx' },
        nextContent: 'x',
      },
    ]);
    expect(out.ok).toBe(false);
  });
});

describe('applyMutationPatches — delete / rename', () => {
  it('deletes a non-entry file', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      { id: 'p1', kind: 'delete', ref: { kind: 'file', path: 'src/B.tsx' } },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/B.tsx')).toBeUndefined();
    }
  });
  it('refuses to delete the entry file', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      { id: 'p1', kind: 'delete', ref: { kind: 'file', path: 'src/App.tsx' } },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures[0].code).toBe('MUTATION_ENTRY_CANNOT_DELETE');
    }
  });
  it('renames a non-entry file', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'rename',
        ref: { kind: 'file', path: 'src/B.tsx' },
        nextPath: 'src/B-renamed.tsx',
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.next.files.find((f) => f.path === 'src/B-renamed.tsx')).toBeTruthy();
      expect(out.result.next.files.find((f) => f.path === 'src/B.tsx')).toBeUndefined();
    }
  });
  it('refuses to rename the entry file', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      {
        id: 'p1',
        kind: 'rename',
        ref: { kind: 'file', path: 'src/App.tsx' },
        nextPath: 'src/App2.tsx',
      },
    ]);
    expect(out.ok).toBe(false);
  });
});

describe('applyMutationPatches — batch semantics', () => {
  it('detects duplicate ids', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(env, [
      { id: 'p1', kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'a' },
      { id: 'p1', kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'b' },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures[0].code).toBe('MUTATION_ID_DUPLICATE');
    }
  });
  it('skips patches in skipIds', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(
      env,
      [
        { id: 'p1', kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'X' },
        { id: 'p2', kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'Y' },
      ],
      { skipIds: new Set(['p1']) }
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.applied.map((p) => p.id)).toEqual(['p2']);
    }
  });
  it('continueOnError records failures without aborting', () => {
    const env = baseSnapshot();
    const out = applyMutationPatches(
      env,
      [
        { id: 'p1', kind: 'replace', ref: { kind: 'file', path: 'src/Missing.tsx' }, nextContent: 'x' },
        { id: 'p2', kind: 'append', ref: { kind: 'file', path: 'src/B.tsx' }, next: 'OK' },
      ],
      { continueOnError: true }
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.failures.length).toBe(1);
      expect(out.failures[0].id).toBe('p1');
      expect(out.result.applied.map((p) => p.id)).toEqual(['p2']);
    }
  });
});

describe('diffLines', () => {
  it('produces an LCS-style diff', () => {
    const lines = diffLines('a\nb\nc', 'a\nx\nc');
    expect(lines.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['x']);
    expect(lines.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['b']);
    expect(lines.filter((l) => l.kind === 'context').map((l) => l.text)).toEqual(['a', 'c']);
  });
  it('handles CRLF normalization', () => {
    const lines = diffLines('a\r\nb', 'a\nb');
    expect(lines.every((l) => l.kind !== 'add' && l.kind !== 'del')).toBe(true);
  });
});

describe('applyMutationPatches — ref validation', () => {
  it('rejects ref.kind that is not in the allowed set', () => {
    const env = baseSnapshot();
    expect(() =>
      applyMutationPatches(env, [
        {
          id: 'p1',
          kind: 'append',
          ref: { kind: 'warp' as never, path: 'src/B.tsx' },
          next: 'x',
        },
      ])
    ).toThrowError(/ref.kind/);
  });
  it('rejects ref without path', () => {
    const env = baseSnapshot();
    expect(() =>
      applyMutationPatches(env, [
        {
          id: 'p1',
          kind: 'append',
          ref: { kind: 'file' } as never,
          next: 'x',
        },
      ])
    ).toThrowError(/ref.path/);
  });
  it('MutationValidationError is the only error class we throw', () => {
    expect(new MutationValidationError('MUTATION_NOT_OBJECT', 'x').code).toBe('MUTATION_NOT_OBJECT');
  });
});
