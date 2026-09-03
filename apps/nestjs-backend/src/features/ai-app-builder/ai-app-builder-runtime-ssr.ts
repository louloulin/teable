/**
 * AI App Builder runtime SSR renderer (R57).
 *
 * Combines the snapshot normalizer + JSX sandbox into a single
 * `renderAppHtml` function. Two modes:
 *
 *   - preview  — render any snapshot, including drafts; injects a
 *                "Preview" banner so users cannot confuse it with a
 *                published app.
 *   - live     — render only published snapshots; injects a minimal
 *                "Live" banner with the slug + version.
 *
 * The renderer:
 *   1. Normalizes the snapshot (legacy → envelope; rejects bad paths).
 *   2. Resolves the entry file; rejects non-`.tsx`/`.jsx` entries.
 *   3. Parses + renders the entry through the JSX sandbox.
 *   4. Wraps the rendered HTML in a deterministic HTML shell with
 *      CSP headers, no inline scripts, and an optional Tailwind CDN
 *      runtime `<script>` when the snapshot sets `tailwind: true`.
 *   5. Injects `env.SECRET_KEY` lookups from the secrets map (values
 *      never reach the client — only resolved into the SSR HTML when
 *      the JSX uses `{env.SECRET_KEY}` directly).
 *
 * `renderAppHtml` is pure: the same inputs always produce the same
 * output bytes (modulo `renderedAt`). The caller is responsible for
 * setting HTTP headers (`cache-control`, `content-security-policy`,
 * `x-app-renderer`).
 */

import {
  type SnapshotApp,
  type SnapshotEnvelope,
  getEntryFile,
  normalizeSnapshot,
  SnapshotValidationError,
} from './ai-app-builder-snapshot';
import {
  type JsxComponent,
  type RenderResult,
  renderElement,
  renderSnapshotEntry,
  JsxSandboxError,
} from './ai-app-builder-jsx-sandbox';

export type RuntimeMode = 'preview' | 'live';

export type RuntimeSecrets = Record<string, string>;

export type RenderAppOptions = {
  mode: RuntimeMode;
  appName: string;
  versionNumber: number;
  deployedAt: string;
  publicSlug?: string;
  /** Resolved secrets for `env.SECRET_KEY` lookups in JSX. */
  secrets?: RuntimeSecrets;
  /** Custom components keyed by uppercase tag (e.g. `Button`, `Card`). */
  components?: Record<string, JsxComponent>;
  /** Set a fixed timestamp for deterministic rendering in tests. */
  renderedAt?: Date;
};

export type RenderAppResult =
  | { ok: true; html: string; meta: RenderAppMeta }
  | {
      ok: false;
      code: string;
      message: string;
      meta: RenderAppMeta;
    };

export type RenderAppMeta = {
  mode: RuntimeMode;
  appName: string;
  entry: string;
  tailwind: boolean;
  empty: boolean;
  renderedAt: string;
  bytes: number;
};

const SHELL_PREFIX = (mode: RuntimeMode, meta: RenderAppMeta, opts: RenderAppOptions) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-teable-runtime" content="${escapeAttr(meta.mode)}" />
<meta name="x-teable-rendered-at" content="${escapeAttr(meta.renderedAt)}" />
<meta name="x-teable-entry" content="${escapeAttr(meta.entry)}" />
<title>${escapeHtml(meta.appName)} — Teable App</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; padding: 0; color: #1f2937; line-height: 1.5; }
  .teable-banner { padding: .5rem 1rem; font-size: .75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .teable-banner.preview { background: #fef3c7; color: #92400e; border-bottom: 1px solid #fbbf24; }
  .teable-banner.live { background: #ecfdf5; color: #065f46; border-bottom: 1px solid #34d399; }
  .teable-app-root { padding: 1rem 2rem; }
  .teable-empty { color: #6b7280; padding: 1rem; }
</style>
${meta.tailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
</head>
<body>
<div class="teable-banner ${meta.mode}">${escapeHtml(bannerText(meta, opts))}</div>
<div class="teable-app-root">`;

const SHELL_SUFFIX = (mode: RuntimeMode, meta: RenderAppMeta) =>
  `</div>
<footer style="font-size: .65rem; color: #9ca3af; padding: .5rem 1rem; border-top: 1px solid #e5e7eb; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
R57 SSR sandbox • mode=${escapeHtml(meta.mode)} • entry=${escapeHtml(meta.entry)} • rendered=${escapeHtml(meta.renderedAt)} • bytes=${meta.bytes}
</footer>
</body>
</html>`;

function bannerText(meta: RenderAppMeta, opts: RenderAppOptions): string {
  const slug = opts.publicSlug ? ` • slug=${opts.publicSlug}` : '';
  if (meta.mode === 'preview') {
    return `Preview • ${meta.appName} • entry=${meta.entry}${slug} • rendered=${meta.renderedAt}`;
  }
  return `Live • ${meta.appName} • entry=${meta.entry}${slug} • rendered=${meta.renderedAt}`;
}

/**
 * Render an app snapshot to a full HTML page. Pure function; the only
 * timestamp comes from `opts.renderedAt ?? new Date()` so tests can pin it.
 */
export function renderAppHtml(snapshot: unknown, opts: RenderAppOptions): RenderAppResult {
  let env: SnapshotEnvelope;
  try {
    env = normalizeSnapshot(snapshot);
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      return makeError(opts, err.code, err.message);
    }
    throw err;
  }
  const entry = env.app.entry;
  const entryFile = getEntryFile(env);
  const meta: RenderAppMeta = {
    mode: opts.mode,
    appName: opts.appName,
    entry,
    tailwind: env.app.tailwind === true,
    empty: false,
    renderedAt: (opts.renderedAt ?? new Date()).toISOString(),
    bytes: 0,
  };
  if (!entryFile) {
    return makeError(opts, 'RUNTIME_EMPTY_ENTRY', `entry file missing: ${entry}`, meta);
  }
  if (entryFile.language !== 'tsx' && entryFile.language !== 'jsx') {
    return makeError(
      opts,
      'RUNTIME_BAD_ENTRY_LANGUAGE',
      `entry file must be .tsx or .jsx (got ${entryFile.language ?? 'unknown'})`,
      meta
    );
  }
  let rendered: RenderResult;
  try {
    rendered = renderSnapshotEntry(entryFile, {
      env: opts.secrets ?? {},
      components: opts.components ?? {},
    });
  } catch (err) {
    if (err instanceof JsxSandboxError) {
      return makeError(opts, err.code, err.message, meta);
    }
    throw err;
  }
  meta.empty = rendered.empty;
  meta.bytes = rendered.html.length;
  const banner = SHELL_PREFIX(opts.mode, meta, opts) + (rendered.html || '<p class="teable-empty">Empty app — add some JSX to the entry file.</p>') + SHELL_SUFFIX(opts.mode, meta);
  return { ok: true, html: banner, meta };
}

function makeError(
  opts: RenderAppOptions,
  code: string,
  message: string,
  partialMeta?: Partial<RenderAppMeta>
): RenderAppResult {
  const meta: RenderAppMeta = {
    mode: opts.mode,
    appName: opts.appName,
    entry: 'src/App.tsx',
    tailwind: false,
    empty: true,
    renderedAt: (opts.renderedAt ?? new Date()).toISOString(),
    bytes: 0,
    ...partialMeta,
  };
  const errorHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="x-teable-runtime" content="${escapeAttr(meta.mode)}" />
<meta name="x-teable-rendered-at" content="${escapeAttr(meta.renderedAt)}" />
<meta name="x-teable-error" content="${escapeAttr(String(code))}" />
<title>Render error — ${escapeHtml(opts.appName)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 720px; padding: 0 1rem; color: #1f2937; }
  pre { background: #f3f4f6; padding: 1rem; border-radius: .375rem; overflow-x: auto; font-size: .8rem; line-height: 1.4; }
  h1 { color: #b91c1c; font-size: 1.25rem; }
</style>
</head>
<body>
<h1>Runtime error</h1>
<p>The App Builder sandbox rejected this snapshot.</p>
<dl>
  <dt>Code</dt><dd><code>${escapeHtml(String(code))}</code></dd>
  <dt>Message</dt><dd><code>${escapeHtml(message)}</code></dd>
  <dt>Mode</dt><dd>${escapeHtml(meta.mode)}</dd>
  <dt>App</dt><dd>${escapeHtml(opts.appName)}</dd>
</dl>
<pre>${escapeHtml(message)}</pre>
</body>
</html>`;
  return { ok: false, code, message, meta: { ...meta, bytes: errorHtml.length } as RenderAppMeta };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

/* ─── csp helper ────────────────────────────────────────────────── */

/**
 * Build a Content-Security-Policy header value tailored to the
 * runtime's actual emissions. We allow only the Tailwind CDN (when
 * `tailwind: true`) and forbid inline event handlers + eval.
 */
export function buildRuntimeCsp(opts: { tailwind: boolean; entry: string }): string {
  const scriptSrc = opts.tailwind
    ? `script-src 'self' https://cdn.tailwindcss.com;`
    : `script-src 'self';`;
  const styleSrc = `style-src 'self' 'unsafe-inline';`;
  const imgSrc = `img-src 'self' data: https:;`;
  const connectSrc = `connect-src 'self';`;
  const defaultSrc = `default-src 'self';`;
  const baseUri = `base-uri 'none';`;
  const frameAncestors = `frame-ancestors 'self';`;
  return [defaultSrc, scriptSrc, styleSrc, imgSrc, connectSrc, baseUri, frameAncestors].join(' ');
}
