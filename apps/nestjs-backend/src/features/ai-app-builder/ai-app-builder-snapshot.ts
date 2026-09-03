/**
 * AI App Builder snapshot schema + normalizer (R57).
 *
 * Cloud's App Builder lets a user build a React/Tailwind app from a base.
 * The snapshot is the persisted design — a tree of source files plus the
 * component entry. We mirror that shape so:
 *   - the sandbox renderer can pick the entry file and transpile to HTML
 *   - element-reference mutations can target specific files / lines / props
 *   - Live vs Preview runtime can decide which file tree to load
 *
 * Pure functions only — no I/O, no Prisma. All errors are typed via
 * `SnapshotValidationError` so callers can surface structured codes.
 */

export type SnapshotSourceFile = {
  /** POSIX-style relative path inside the app; e.g. `src/App.tsx`, `index.html`. */
  path: string;
  /** UTF-8 source text. For `.tsx` / `.jsx` files, JSX must follow the
   *  restricted grammar the sandbox accepts. */
  content: string;
  /** Optional language hint; inferred from `path` when omitted. */
  language?: 'tsx' | 'jsx' | 'ts' | 'js' | 'html' | 'css' | 'json' | 'text';
};

export type SnapshotApp = {
  /** Files in dependency order; `index.html` is treated as the shell. */
  files: SnapshotSourceFile[];
  /** The component entry the sandbox renders. Default: `src/App.tsx`. */
  entry: string;
  /** Optional Tailwind config flag — surfaced to the sandbox so it knows
   *  whether to inject the Tailwind CDN runtime script. */
  tailwind?: boolean;
};

export type SnapshotEnvelope = {
  /** Schema version. Bumped when the snapshot shape changes. */
  schema: 1;
  /** App definition. */
  app: SnapshotApp;
};

/** Legacy snapshot shape: `{ files, components }`. We normalize to envelope. */
export type LegacySnapshot = {
  files?: unknown;
  components?: unknown;
};

/* ─── public error type ─────────────────────────────────────────────── */

export type SnapshotValidationCode =
  | 'SNAPSHOT_NOT_OBJECT'
  | 'SNAPSHOT_APP_MISSING'
  | 'SNAPSHOT_FILES_INVALID'
  | 'SNAPSHOT_FILE_INVALID'
  | 'SNAPSHOT_PATH_INVALID'
  | 'SNAPSHOT_PATH_DUPLICATE'
  | 'SNAPSHOT_PATH_TRAVERSAL'
  | 'SNAPSHOT_CONTENT_TOO_LARGE'
  | 'SNAPSHOT_ENTRY_INVALID'
  | 'SNAPSHOT_ENTRY_NOT_FOUND'
  | 'SNAPSHOT_FILES_EMPTY'
  | 'SNAPSHOT_TOO_MANY_FILES';

export class SnapshotValidationError extends Error {
  readonly code: SnapshotValidationCode;
  constructor(code: SnapshotValidationCode, message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
    this.code = code;
  }
}

/* ─── size + count guards ─────────────────────────────────────────── */

export const SNAPSHOT_MAX_FILE_BYTES = 256 * 1024; // 256 KB per file
export const SNAPSHOT_MAX_FILES = 64;

/* ─── path normalization ──────────────────────────────────────────── */

/**
 * Normalize a POSIX path: collapse runs of `/`, drop `./`, reject `..`
 * segments and absolute paths. Throws on traversal / absolute.
 */
export function normalizeSnapshotPath(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new SnapshotValidationError('SNAPSHOT_PATH_INVALID', 'path must be a non-empty string');
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(raw)) {
    throw new SnapshotValidationError('SNAPSHOT_PATH_TRAVERSAL', `path must be relative: ${raw}`);
  }
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      throw new SnapshotValidationError('SNAPSHOT_PATH_TRAVERSAL', `path may not contain '..': ${raw}`);
    }
    parts.push(seg);
  }
  const joined = parts.join('/');
  if (joined.length === 0) {
    throw new SnapshotValidationError('SNAPSHOT_PATH_INVALID', `path resolves to empty: ${raw}`);
  }
  if (parts.some((p) => p.includes('\\0') || p.includes('\0'))) {
    throw new SnapshotValidationError('SNAPSHOT_PATH_INVALID', `path contains null byte: ${raw}`);
  }
  return joined;
}

/* ─── file normalization ──────────────────────────────────────────── */

export function inferLanguage(path: string): SnapshotSourceFile['language'] {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'js';
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  return 'text';
}

function normalizeFile(input: unknown): SnapshotSourceFile {
  if (!input || typeof input !== 'object') {
    throw new SnapshotValidationError('SNAPSHOT_FILE_INVALID', 'file must be an object');
  }
  const rec = input as Record<string, unknown>;
  const path = normalizeSnapshotPath(String(rec.path ?? ''));
  const contentRaw = rec.content;
  if (typeof contentRaw !== 'string') {
    throw new SnapshotValidationError('SNAPSHOT_FILE_INVALID', `file ${path}: content must be a string`);
  }
  if (Buffer.byteLength(contentRaw, 'utf8') > SNAPSHOT_MAX_FILE_BYTES) {
    throw new SnapshotValidationError(
      'SNAPSHOT_CONTENT_TOO_LARGE',
      `file ${path}: content exceeds ${SNAPSHOT_MAX_FILE_BYTES} bytes`
    );
  }
  const langHint = rec.language;
  const language: SnapshotSourceFile['language'] =
    typeof langHint === 'string' && ['tsx', 'jsx', 'ts', 'js', 'html', 'css', 'json', 'text'].includes(langHint)
      ? (langHint as SnapshotSourceFile['language'])
      : inferLanguage(path);
  return { path, content: contentRaw, language };
}

/* ─── entry normalization ──────────────────────────────────────────── */

export function defaultEntry(): string {
  return 'src/App.tsx';
}

/* ─── legacy envelope support ─────────────────────────────────────── */

/**
 * Migrate a legacy `{ files, components }` snapshot to the R57 envelope.
 * Legacy `components` (if present) are appended as `src/components/<name>.tsx`
 * stubs with the supplied description — enough to keep older deploys readable.
 */
export function migrateLegacySnapshot(legacy: LegacySnapshot): SnapshotEnvelope {
  const files: SnapshotSourceFile[] = [];
  if (Array.isArray(legacy.files)) {
    for (const f of legacy.files) {
      files.push(normalizeFile(f));
    }
  }
  if (Array.isArray(legacy.components)) {
    for (const c of legacy.components) {
      if (!c || typeof c !== 'object') continue;
      const rec = c as Record<string, unknown>;
      const name = String(rec.name ?? 'Component').replace(/[^A-Za-z0-9_]/g, '');
      if (!name) continue;
      files.push({
        path: `src/components/${name}.tsx`,
        language: 'tsx',
        content: String(rec.source ?? rec.description ?? `// ${name}`),
      });
    }
  }
  return {
    schema: 1,
    app: {
      files,
      entry: defaultEntry(),
      tailwind: false,
    },
  };
}

/* ─── main normalizer ────────────────────────────────────────────── */

/**
 * Normalize any accepted shape (envelope, legacy, raw app) into a
 * `SnapshotEnvelope`. Throws `SnapshotValidationError` on any issue so
 * callers can map it to a 4xx response with a stable code.
 */
export function normalizeSnapshot(input: unknown): SnapshotEnvelope {
  if (!input || typeof input !== 'object') {
    // Empty snapshot → empty envelope so deploys that pre-date the file
    // schema still pass validation; Live renders a graceful empty page.
    return { schema: 1, app: { files: [], entry: defaultEntry(), tailwind: false } };
  }
  const rec = input as Record<string, unknown>;
  // Envelope form.
  if (rec.schema === 1 && rec.app && typeof rec.app === 'object') {
    return normalizeApp(rec.app as Record<string, unknown>);
  }
  // Legacy `{ files, components }`.
  if ('files' in rec || 'components' in rec) {
    return normalizeApp(migrateLegacySnapshot(rec as LegacySnapshot).app as unknown as Record<string, unknown>);
  }
  // Raw app form (no envelope wrapper).
  if ('files' in rec || 'entry' in rec) {
    return normalizeApp(rec);
  }
  throw new SnapshotValidationError(
    'SNAPSHOT_APP_MISSING',
    'snapshot must be an envelope { schema, app }, a legacy { files, components }, or an app { files, entry }'
  );
}

function normalizeApp(appLike: Record<string, unknown>): SnapshotEnvelope {
  const filesRaw = appLike.files;
  if (!Array.isArray(filesRaw)) {
    throw new SnapshotValidationError('SNAPSHOT_FILES_INVALID', 'app.files must be an array');
  }
  if (filesRaw.length === 0) {
    throw new SnapshotValidationError('SNAPSHOT_FILES_EMPTY', 'app.files must contain at least one file');
  }
  if (filesRaw.length > SNAPSHOT_MAX_FILES) {
    throw new SnapshotValidationError(
      'SNAPSHOT_TOO_MANY_FILES',
      `app.files exceeds max ${SNAPSHOT_MAX_FILES} entries`
    );
  }
  const seen = new Set<string>();
  const files: SnapshotSourceFile[] = [];
  for (const f of filesRaw) {
    const nf = normalizeFile(f);
    if (seen.has(nf.path)) {
      throw new SnapshotValidationError(
        'SNAPSHOT_PATH_DUPLICATE',
        `duplicate file path: ${nf.path}`
      );
    }
    seen.add(nf.path);
    files.push(nf);
  }
  const entryRaw = appLike.entry;
  const entry = typeof entryRaw === 'string' && entryRaw.length > 0 ? normalizeSnapshotPath(entryRaw) : defaultEntry();
  if (!seen.has(entry)) {
    throw new SnapshotValidationError(
      'SNAPSHOT_ENTRY_NOT_FOUND',
      `entry file not present in files: ${entry}`
    );
  }
  const tailwind = appLike.tailwind === true;
  return { schema: 1, app: { files, entry, tailwind } };
}

/* ─── convenience selectors ───────────────────────────────────────── */

/** Return the entry file object (or undefined). */
export function getEntryFile(env: SnapshotEnvelope): SnapshotSourceFile | undefined {
  return env.app.files.find((f) => f.path === env.app.entry);
}

/** Return a file by path (or undefined). */
export function getFileByPath(env: SnapshotEnvelope, path: string): SnapshotSourceFile | undefined {
  const norm = (() => {
    try {
      return normalizeSnapshotPath(path);
    } catch {
      return null;
    }
  })();
  if (!norm) return undefined;
  return env.app.files.find((f) => f.path === norm);
}

/** Total bytes across all files (UTF-8). */
export function totalSnapshotBytes(env: SnapshotEnvelope): number {
  let total = 0;
  for (const f of env.app.files) total += Buffer.byteLength(f.content, 'utf8');
  return total;
}
