/**
 * AI App Builder mutation engine (R57).
 *
 * Pure patch applicator that turns chat-driven "edit this element" /
 * "rename this file" / "create this file" intents into deterministic
 * file-tree mutations. Designed to be replayable (idempotent when
 * `patch.id` already exists in `applied`) and reviewable (each patch
 * carries a human description + a structured diff preview).
 *
 * Patch kinds:
 *
 *   replace   — full-file replace (rare; usually `replaceRange` is safer)
 *   replaceRange — substring replace inside an existing file
 *   append    — append a chunk to the end of an existing file
 *   create    — add a new file (error if path already exists)
 *   delete    — remove an existing file (error if path is missing)
 *   rename    — change the path of an existing file (content preserved)
 *
 * Element references (`ElementRef`) are not used to mutate files
 * directly in this round — they are surfaced so the AI chat runtime
 * can locate the file + line for the user before emitting a patch.
 * Mutation by `ElementRef` lands in a future round (R58+) once the
 * chat runtime is wired up.
 *
 * All errors are typed via `MutationValidationError` so callers can
 * map to structured 4xx responses with stable codes.
 */

import {
  type SnapshotApp,
  type SnapshotEnvelope,
  normalizeSnapshotPath,
  type SnapshotSourceFile,
  SnapshotValidationError,
} from './ai-app-builder-snapshot';

export type MutationPatchKind =
  | 'replace'
  | 'replaceRange'
  | 'append'
  | 'create'
  | 'delete'
  | 'rename';

export type ElementRefKind = 'file' | 'tag' | 'prop' | 'text' | 'line';

export type ElementRef = {
  /** Which kind of element the reference targets. */
  kind: ElementRefKind;
  /** POSIX-style path to the file inside the app. */
  path: string;
  /** Optional 1-based line number; resolved against current file content. */
  line?: number;
  /** Optional CSS selector-style tag name; e.g. `Button`. */
  tag?: string;
  /** Optional JSX attribute name when `kind === 'prop'`. */
  propName?: string;
  /** Optional text match when `kind === 'text'` (first occurrence). */
  textMatch?: string;
};

export type MutationPatch =
  | {
      id: string;
      kind: 'replace';
      ref: ElementRef;
      /** New full file content. */
      nextContent: string;
      description?: string;
    }
  | {
      id: string;
      kind: 'replaceRange';
      ref: ElementRef;
      /** Substring to look for. Empty string is rejected. */
      search: string;
      /** Replacement string. May be empty (deletes the matched range). */
      next: string;
      /** When true, replace every occurrence; otherwise first only. */
      replaceAll?: boolean;
      description?: string;
    }
  | {
      id: string;
      kind: 'append';
      ref: ElementRef;
      /** Content to append (verbatim; newline separators are the caller's job). */
      next: string;
      description?: string;
    }
  | {
      id: string;
      kind: 'create';
      ref: ElementRef;
      /** Content for the new file. */
      nextContent: string;
      description?: string;
    }
  | {
      id: string;
      kind: 'delete';
      ref: ElementRef;
      description?: string;
    }
  | {
      id: string;
      kind: 'rename';
      ref: ElementRef;
      nextPath: string;
      description?: string;
    };

export type MutationValidationCode =
  | 'MUTATION_NOT_OBJECT'
  | 'MUTATION_ID_MISSING'
  | 'MUTATION_KIND_INVALID'
  | 'MUTATION_REF_INVALID'
  | 'MUTATION_REF_PATH_INVALID'
  | 'MUTATION_REF_LINE_INVALID'
  | 'MUTATION_SEARCH_EMPTY'
  | 'MUTATION_NEXT_CONTENT_MISSING'
  | 'MUTATION_NEXT_PATH_INVALID'
  | 'MUTATION_TARGET_NOT_FOUND'
  | 'MUTATION_TARGET_ALREADY_EXISTS'
  | 'MUTATION_RANGE_NOT_FOUND'
  | 'MUTATION_ENTRY_CANNOT_DELETE'
  | 'MUTATION_ENTRY_CANNOT_RENAME'
  | 'MUTATION_ID_DUPLICATE';

export class MutationValidationError extends Error {
  readonly code: MutationValidationCode;
  constructor(code: MutationValidationCode, message: string) {
    super(message);
    this.name = 'MutationValidationError';
    this.code = code;
  }
}

export type ApplyResult = {
  /** New file tree after applying all patches. */
  next: SnapshotApp;
  /** Patches that produced changes, in input order. */
  applied: MutationPatch[];
  /** Stable per-patch diff preview (caller decides whether to render). */
  diffs: Array<{
    id: string;
    kind: MutationPatchKind;
    path: string;
    /** True when the patch was a no-op (e.g. search not found). */
    noop: boolean;
    /** Human description echoed from the patch. */
    description: string | null;
  }>;
};

/* ─── ref resolution ─────────────────────────────────────────────── */

/**
 * Resolve an `ElementRef` to a concrete file in the envelope. The
 * returned object carries the file plus the matched location (when
 * applicable) so callers can render a preview without re-running
 * the lookup.
 */
export function resolveElementRef(
  env: SnapshotEnvelope,
  ref: ElementRef
): {
  path: string;
  file: SnapshotSourceFile;
  index: number;
  matched: { kind: 'file' } | { kind: 'line'; line: number; column: number } | { kind: 'tag'; tag: string } | { kind: 'prop'; propName: string } | { kind: 'text'; index: number; line: number } | null;
} {
  const path = normalizeSnapshotPath(ref.path);
  const index = env.app.files.findIndex((f) => f.path === path);
  if (index === -1) {
    throw new MutationValidationError(
      'MUTATION_REF_INVALID',
      `ref path not found in files: ${path}`
    );
  }
  const file = env.app.files[index];
  const lineCount = file.content.split('\n').length;
  if (ref.kind === 'line') {
    if (typeof ref.line !== 'number' || !Number.isInteger(ref.line) || ref.line < 1 || ref.line > lineCount) {
      throw new MutationValidationError(
        'MUTATION_REF_LINE_INVALID',
        `line ${ref.line} out of range (file has ${lineCount} lines)`
      );
    }
    const lines = file.content.split('\n');
    const prefix = lines.slice(0, ref.line - 1).join('\n');
    const column = (prefix.length === 0 ? 0 : prefix.length + 1);
    return { path, file, index, matched: { kind: 'line', line: ref.line, column } };
  }
  if (ref.kind === 'tag') {
    if (!ref.tag || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(ref.tag)) {
      throw new MutationValidationError('MUTATION_REF_INVALID', 'tag ref requires a valid tag name');
    }
    return { path, file, index, matched: { kind: 'tag', tag: ref.tag } };
  }
  if (ref.kind === 'prop') {
    if (!ref.propName || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(ref.propName)) {
      throw new MutationValidationError('MUTATION_REF_INVALID', 'prop ref requires a valid propName');
    }
    return { path, file, index, matched: { kind: 'prop', propName: ref.propName } };
  }
  if (ref.kind === 'text') {
    if (!ref.textMatch) {
      throw new MutationValidationError('MUTATION_REF_INVALID', 'text ref requires textMatch');
    }
    const foundAt = file.content.indexOf(ref.textMatch);
    if (foundAt === -1) {
      throw new MutationValidationError(
        'MUTATION_REF_INVALID',
        `text ref did not match: ${ref.textMatch.slice(0, 80)}`
      );
    }
    const before = file.content.slice(0, foundAt);
    const line = before.split('\n').length;
    return { path, file, index, matched: { kind: 'text', index: foundAt, line } };
  }
  if (ref.kind === 'file') {
    return { path, file, index, matched: { kind: 'file' } };
  }
  throw new MutationValidationError('MUTATION_REF_INVALID', `unknown ref kind`);
}

/* ─── patch validation ───────────────────────────────────────────── */

function assertString(v: unknown, code: MutationValidationCode, msg: string): string {
  if (typeof v !== 'string') {
    throw new MutationValidationError(code, msg);
  }
  return v;
}

function validatePatch(input: unknown): MutationPatch {
  if (!input || typeof input !== 'object') {
    throw new MutationValidationError('MUTATION_NOT_OBJECT', 'patch must be an object');
  }
  const rec = input as Record<string, unknown>;
  const id = assertString(rec.id, 'MUTATION_ID_MISSING', 'patch.id is required');
  const kind = rec.kind;
  if (typeof kind !== 'string') {
    throw new MutationValidationError('MUTATION_KIND_INVALID', `patch.kind is required (got ${typeof kind})`);
  }
  const ref = validateRef(rec.ref);
  const description = typeof rec.description === 'string' ? rec.description : undefined;
  switch (kind) {
    case 'replace': {
      const nextContent = assertString(rec.nextContent, 'MUTATION_NEXT_CONTENT_MISSING', 'replace requires nextContent');
      return { id, kind, ref, nextContent, description };
    }
    case 'replaceRange': {
      const search = assertString(rec.search, 'MUTATION_SEARCH_EMPTY', 'replaceRange requires search');
      if (search.length === 0) {
        throw new MutationValidationError('MUTATION_SEARCH_EMPTY', 'replaceRange.search must be non-empty');
      }
      const next = typeof rec.next === 'string' ? rec.next : '';
      const replaceAll = rec.replaceAll === true;
      return { id, kind, ref, search, next, replaceAll, description };
    }
    case 'append': {
      const next = assertString(rec.next, 'MUTATION_NEXT_CONTENT_MISSING', 'append requires next');
      return { id, kind, ref, next, description };
    }
    case 'create': {
      const nextContent = assertString(rec.nextContent, 'MUTATION_NEXT_CONTENT_MISSING', 'create requires nextContent');
      return { id, kind, ref, nextContent, description };
    }
    case 'delete':
      return { id, kind, ref, description };
    case 'rename': {
      const nextPath = assertString(rec.nextPath, 'MUTATION_NEXT_PATH_INVALID', 'rename requires nextPath');
      try {
        normalizeSnapshotPath(nextPath);
      } catch (err) {
        if (err instanceof SnapshotValidationError) {
          throw new MutationValidationError('MUTATION_NEXT_PATH_INVALID', err.message);
        }
        throw err;
      }
      return { id, kind, ref, nextPath, description };
    }
    default:
      throw new MutationValidationError('MUTATION_KIND_INVALID', `unknown patch kind: ${kind}`);
  }
}

function validateRef(input: unknown): ElementRef {
  if (!input || typeof input !== 'object') {
    throw new MutationValidationError('MUTATION_REF_INVALID', 'patch.ref must be an object');
  }
  const rec = input as Record<string, unknown>;
  const kind = rec.kind;
  if (typeof kind !== 'string') {
    throw new MutationValidationError('MUTATION_REF_INVALID', 'ref.kind is required');
  }
  const allowed: ElementRefKind[] = ['file', 'tag', 'prop', 'text', 'line'];
  if (!allowed.includes(kind as ElementRefKind)) {
    throw new MutationValidationError('MUTATION_REF_INVALID', `ref.kind must be one of ${allowed.join(', ')}`);
  }
  const path = assertString(rec.path, 'MUTATION_REF_PATH_INVALID', 'ref.path is required');
  try {
    normalizeSnapshotPath(path);
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      throw new MutationValidationError('MUTATION_REF_PATH_INVALID', err.message);
    }
    throw err;
  }
  const out: ElementRef = { kind: kind as ElementRefKind, path };
  if (kind === 'line' && typeof rec.line === 'number') out.line = rec.line;
  if (kind === 'tag' && typeof rec.tag === 'string') out.tag = rec.tag;
  if (kind === 'prop' && typeof rec.propName === 'string') out.propName = rec.propName;
  if (kind === 'text' && typeof rec.textMatch === 'string') out.textMatch = rec.textMatch;
  return out;
}

/* ─── applier ────────────────────────────────────────────────────── */

export type ApplyOptions = {
  /** Patches with these ids are skipped (idempotency on replay). */
  skipIds?: Set<string>;
  /** When true, errors do not abort the whole batch (caller gets a `failures` array). */
  continueOnError?: boolean;
  /** When true (default), refuse to mutate the snapshot entry file via rename/delete. */
  protectEntry?: boolean;
};

export type ApplyFailure = {
  id: string;
  code: MutationValidationCode;
  message: string;
};

export type ApplyOutcome =
  | { ok: true; result: ApplyResult; failures: ApplyFailure[] }
  | { ok: false; result: null; failures: ApplyFailure[] };

/**
 * Apply an ordered list of patches to a snapshot. Patches run in the
 * supplied order; later patches see the file tree produced by earlier
 * patches. The result is `ok: false` only when `continueOnError` is
 * false and any patch fails; otherwise the failures are returned in
 * `failures` and the rest are applied.
 */
export function applyMutationPatches(
  env: SnapshotEnvelope,
  patches: unknown[],
  options: ApplyOptions = {}
): ApplyOutcome {
  const skipIds = options.skipIds ?? new Set<string>();
  const protectEntry = options.protectEntry !== false;
  const validated: MutationPatch[] = [];
  for (const p of patches) {
    const v = validatePatch(p);
    if (skipIds.has(v.id)) continue;
    validated.push(v);
  }
  // Detect duplicate ids within the batch.
  const seenIds = new Set<string>();
  for (const p of validated) {
    if (seenIds.has(p.id)) {
      return {
        ok: false,
        result: null,
        failures: [{ id: p.id, code: 'MUTATION_ID_DUPLICATE', message: `duplicate patch id in batch: ${p.id}` }],
      };
    }
    seenIds.add(p.id);
  }
  let files = env.app.files.slice();
  const applied: MutationPatch[] = [];
  const diffs: ApplyResult['diffs'] = [];
  const failures: ApplyFailure[] = [];
  for (const patch of validated) {
    try {
      const out = applyOne(files, env.app.entry, patch, protectEntry);
      files = out.files;
      if (out.applied) applied.push(patch);
      diffs.push({
        id: patch.id,
        kind: patch.kind,
        path: out.targetPath,
        noop: out.noop,
        description: (patch as { description?: string }).description ?? null,
      });
    } catch (err) {
      if (err instanceof MutationValidationError) {
        const failure: ApplyFailure = { id: patch.id, code: err.code, message: err.message };
        if (options.continueOnError) {
          failures.push(failure);
          continue;
        }
        return { ok: false, result: null, failures: [failure] };
      }
      throw err;
    }
  }
  return {
    ok: true,
    result: {
      next: { ...env.app, files },
      applied,
      diffs,
    },
    failures,
  };
}

type ApplyOneOutput = {
  files: SnapshotSourceFile[];
  applied: boolean;
  noop: boolean;
  targetPath: string;
};

function applyOne(
  files: SnapshotSourceFile[],
  entry: string,
  patch: MutationPatch,
  protectEntry: boolean
): ApplyOneOutput {
  const refPath = normalizeSnapshotPath(patch.ref.path);
  const index = files.findIndex((f) => f.path === refPath);
  switch (patch.kind) {
    case 'replace': {
      if (index === -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_NOT_FOUND',
          `replace: file not found: ${refPath}`
        );
      }
      const next = files.slice();
      next[index] = { ...next[index], content: patch.nextContent, language: next[index].language };
      return { files: next, applied: true, noop: false, targetPath: refPath };
    }
    case 'replaceRange': {
      if (index === -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_NOT_FOUND',
          `replaceRange: file not found: ${refPath}`
        );
      }
      const file = files[index];
      const occurrences = patch.replaceAll
        ? file.content.split(patch.search).length - 1
        : file.content.includes(patch.search)
        ? 1
        : 0;
      if (occurrences === 0) {
        throw new MutationValidationError(
          'MUTATION_RANGE_NOT_FOUND',
          `replaceRange: search string not found in ${refPath}`
        );
      }
      const next = files.slice();
      const newContent = patch.replaceAll
        ? file.content.split(patch.search).join(patch.next)
        : file.content.replace(patch.search, patch.next);
      next[index] = { ...file, content: newContent };
      return { files: next, applied: true, noop: false, targetPath: refPath };
    }
    case 'append': {
      if (index === -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_NOT_FOUND',
          `append: file not found: ${refPath}`
        );
      }
      const file = files[index];
      const separator = file.content.length > 0 && !file.content.endsWith('\n') ? '\n' : '';
      const next = files.slice();
      next[index] = { ...file, content: `${file.content}${separator}${patch.next}` };
      return { files: next, applied: true, noop: patch.next.length === 0, targetPath: refPath };
    }
    case 'create': {
      if (index !== -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_ALREADY_EXISTS',
          `create: file already exists: ${refPath}`
        );
      }
      const inferred = refPath.endsWith('.tsx')
        ? 'tsx'
        : refPath.endsWith('.jsx')
        ? 'jsx'
        : refPath.endsWith('.css')
        ? 'css'
        : refPath.endsWith('.html')
        ? 'html'
        : refPath.endsWith('.json')
        ? 'json'
        : 'text';
      const next = files.slice();
      next.push({ path: refPath, content: patch.nextContent, language: inferred as SnapshotSourceFile['language'] });
      return { files: next, applied: true, noop: false, targetPath: refPath };
    }
    case 'delete': {
      if (index === -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_NOT_FOUND',
          `delete: file not found: ${refPath}`
        );
      }
      if (protectEntry && refPath === entry) {
        throw new MutationValidationError(
          'MUTATION_ENTRY_CANNOT_DELETE',
          `refusing to delete entry file: ${refPath}`
        );
      }
      const next = files.slice();
      next.splice(index, 1);
      return { files: next, applied: true, noop: false, targetPath: refPath };
    }
    case 'rename': {
      if (index === -1) {
        throw new MutationValidationError(
          'MUTATION_TARGET_NOT_FOUND',
          `rename: file not found: ${refPath}`
        );
      }
      if (protectEntry && refPath === entry) {
        throw new MutationValidationError(
          'MUTATION_ENTRY_CANNOT_RENAME',
          `refusing to rename entry file: ${refPath}`
        );
      }
      const newPath = normalizeSnapshotPath(patch.nextPath);
      if (newPath === refPath) {
        return { files, applied: true, noop: true, targetPath: refPath };
      }
      if (files.some((f) => f.path === newPath)) {
        throw new MutationValidationError(
          'MUTATION_TARGET_ALREADY_EXISTS',
          `rename: target path already exists: ${newPath}`
        );
      }
      const next = files.slice();
      next[index] = { ...next[index], path: newPath };
      return { files: next, applied: true, noop: false, targetPath: newPath };
    }
  }
}

/* ─── diff preview ───────────────────────────────────────────────── */

export type DiffLine = { kind: 'context' | 'add' | 'del'; text: string };

/**
 * Compute a simple line-by-line diff between two file contents using
 * the LCS algorithm. Useful for showing the user what a chat-driven
 * mutation actually changed. Lines are compared verbatim; CR / CRLF
 * are normalized to LF before comparison.
 */
export function diffLines(prev: string, next: string): DiffLine[] {
  const a = prev.replace(/\r\n?/g, '\n').split('\n');
  const b = next.replace(/\r\n?/g, '\n').split('\n');
  const lcs = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift({ kind: 'context', text: a[i - 1] });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.unshift({ kind: 'del', text: a[i - 1] });
      i--;
    } else {
      out.unshift({ kind: 'add', text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    out.unshift({ kind: 'del', text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    out.unshift({ kind: 'add', text: b[j - 1] });
    j--;
  }
  return out;
}

function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = a[i - 1] === b[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}
