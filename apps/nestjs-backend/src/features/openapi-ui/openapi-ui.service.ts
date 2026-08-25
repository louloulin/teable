/**
 * OpenAPI UI — pure helpers (Stage 106).
 */

import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';
import type {
  IExplorerPage,
  IExplorerSection,
  IRenderedEndpoint,
  IRenderedHeader,
} from './openapi-ui.types';
import { MAX_UI_ENDPOINT_BYTES, MAX_UI_SECTIONS } from './openapi-ui.types';

/** HTML-escape a string for safe inclusion in markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a single endpoint as an `<li>` markup fragment. */
export function renderEndpoint(op: IOperationSpec): IRenderedEndpoint {
  const verbClass = `verb-${op.verb.toLowerCase()}`;
  const authBadge = op.authRequired ? '<span class="badge auth">auth</span>' : '';
  const markup =
    `<li class="op ${verbClass}" data-id="${escapeHtml(op.operationId)}">` +
    `<span class="verb">${escapeHtml(op.verb)}</span>` +
    `<code class="path">${escapeHtml(op.path)}</code>` +
    `<span class="summary">${escapeHtml(op.summary)}</span>` +
    authBadge +
    `</li>`;
  return {
    id: op.operationId,
    verb: op.verb,
    path: op.path,
    authRequired: op.authRequired,
    summary: op.summary,
    markup,
  };
}

/** Render the page header. */
export function renderHeader(input: {
  title: string;
  version: string;
  jsonPath: string;
}): IRenderedHeader {
  const markup =
    `<header class="hd">` +
    `<h1>${escapeHtml(input.title)} <small>v${escapeHtml(input.version)}</small></h1>` +
    `<p class="meta">Schema: <a href="${escapeHtml(input.jsonPath)}">${escapeHtml(input.jsonPath)}</a></p>` +
    `</header>`;
  return {
    title: input.title,
    version: input.version,
    jsonPath: input.jsonPath,
    markup,
  };
}

/** Group operations by verb (preserves verb order). */
export function groupByVerb(ops: ReadonlyArray<IOperationSpec>): Record<string, IOperationSpec[]> {
  const out: Record<string, IOperationSpec[]> = {};
  for (const op of ops) {
    (out[op.verb] ??= []).push(op);
  }
  return out;
}

/** Render an operations section. */
export function renderOperationsSection(ops: ReadonlyArray<IOperationSpec>): IExplorerSection {
  const rendered = ops.map(renderEndpoint);
  const items = rendered.map((r) => r.markup).join('');
  return {
    heading: 'Operations',
    body: `<ul class="ops">${items}</ul>`,
  };
}

/** Render a schemas section (simple k=v list). */
export function renderSchemasSection(schemas: Record<string, string>): IExplorerSection {
  const items = Object.entries(schemas)
    .map(([k, v]) => `<li><code>${escapeHtml(k)}</code>: ${escapeHtml(v)}</li>`)
    .join('');
  return {
    heading: 'Schemas',
    body: items ? `<ul class="schemas">${items}</ul>` : '<p class="empty">No schemas.</p>',
  };
}

/** Render the static JS bootstrap (fetches the JSON, populates DOM). */
export function renderBootstrapScript(input: { jsonPath: string }): string {
  const j = escapeHtml(input.jsonPath);
  return [
    "fetch('" + j + "')",
    ".then(function (r) { return r.json(); })",
    ".then(function (d) {",
    "  document.title = (d && d.title ? d.title : 'API') + ' Explorer';",
    "  var el = document.getElementById('op-count');",
    "  if (el) el.textContent = (d.operations || []).length;",
    "})",
    ".catch(function () { var el = document.getElementById('op-count'); if (el) el.textContent = '?'; });",
  ].join('\n');
}

/** Render the full HTML page. */
export function renderPage(input: {
  doc: IOpenApiDocument;
  jsonPath: string;
}): IExplorerPage {
  const header = renderHeader({ title: input.doc.title, version: input.doc.version, jsonPath: input.jsonPath });
  const opsSection = renderOperationsSection(input.doc.operations);
  const schemasSection = renderSchemasSection(input.doc.schemas);
  const sections: IExplorerSection[] = [opsSection, schemasSection].slice(0, MAX_UI_SECTIONS);
  return {
    title: input.doc.title,
    version: input.doc.version,
    jsonPath: input.jsonPath,
    sections,
  };
}

/** Render the full HTML document (head + body + bootstrap script). */
export function renderHtmlDocument(input: { doc: IOpenApiDocument; jsonPath: string }): string {
  const page = renderPage(input);
  const head = renderHeader({ title: page.title, version: page.version, jsonPath: page.jsonPath });
  const sections = page.sections.map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.body}</section>`).join('');
  const script = renderBootstrapScript({ jsonPath: page.jsonPath });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(page.title)} Explorer</title>`,
    '<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:0 auto;padding:1rem;} .verb{font-weight:bold;padding:0 .4rem;border-radius:3px;} .verb-get{background:#def;} .verb-post{background:#ffd;} .verb-put{background:#fdc;} .verb-patch{background:#dcf;} .verb-delete{background:#fdd;} .badge.auth{background:#eee;color:#555;padding:0 .3rem;border-radius:3px;font-size:.8em;} code{background:#f5f5f5;padding:0 .3rem;border-radius:3px;} ul{list-style:none;padding:0;} li.op{padding:.4rem 0;border-bottom:1px solid #eee;display:flex;gap:.5rem;align-items:center;}</style>',
    '</head>',
    '<body>',
    head.markup,
    `<p>Operations: <strong id="op-count">${input.doc.operations.length}</strong></p>`,
    sections,
    '<script>',
    script,
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

/** Validate endpoint markup size. */
export function validateEndpointMarkup(markup: string): string | null {
  if (Buffer.byteLength(markup, 'utf-8') > MAX_UI_ENDPOINT_BYTES) {
    return `endpoint markup too large: ${markup.length}`;
  }
  return null;
}

/** Whether a path is safe to embed in href/src. */
export function isSafeRelativePath(p: string): boolean {
  return p.startsWith('/') && !p.includes('://');
}
