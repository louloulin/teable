/**
 * AI App Builder JSX sandbox (R57).
 *
 * Pure SSR transformer that turns a restricted JSX/TSX source into an
 * HTML string. No `eval`, no `new Function`, no module loading — the
 * sandbox only understands the small grammar documented below.
 *
 * Supported grammar (strict subset of JSX):
 *
 *   Element        := `<` Name (Attribute)* (`/>` | `>` Children `</` Name `>`)
 *   Name           := `[A-Za-z][A-Za-z0-9_.]*` (lowercase = intrinsic HTML; uppercase = component)
 *   Attribute      := Name (`=` (StringLit | Expr)) | Name
 *   Children       := (Text | Expr | Element)*
 *   Expr           := `{` (StringLit | NumericLit | Ident | EnvLookup | BoolLit | NullLit) `}`
 *   EnvLookup      := `env` `.` Ident
 *   StringLit      := `"..."` | `'`...`'`  (no escapes inside braces — only `\"` / `\\`)
 *   NumericLit     := `-? [0-9]+ (\.[0-9]+)?`
 *   Ident          := `[A-Za-z_$][A-Za-z0-9_$]*`
 *   BoolLit        := `true` | `false`
 *   NullLit        := `null`
 *   Text           := any run of characters except `<`, `{`, `}`
 *
 * Components (uppercase Names) are resolved from the `components` map.
 * Each component is `(props, env) => string`. Components may return
 * the result of `renderElement(...)` to compose other components.
 *
 * Security boundaries (enforced by the parser, not the runtime):
 *   - No identifiers besides `env`, `props`, component names, and
 *     declared prop keys ever resolve to a value.
 *   - No function bodies, no arrow functions, no `import` / `require` /
 *     `class` / `this` / `globalThis` / `process` / `eval`.
 *   - All attribute values are stringified; HTML-escaped before emit.
 *   - Text nodes are HTML-escaped; `{...}` expression values are
 *     HTML-escaped when stringified.
 */

import type { SnapshotSourceFile } from './ai-app-builder-snapshot';

export type JsxComponent = (
  props: Record<string, unknown>,
  env: Record<string, string>,
  renderElement: (el: JsxElement) => string
) => string;

export type JsxElement = {
  tag: string;
  selfClosing: boolean;
  attributes: JsxAttribute[];
  children: Array<JsxNode | string>;
};

export type JsxAttribute = {
  name: string;
  // exactly one of literal / expr
  literal: string | number | boolean | null | undefined;
  isExpr: boolean;
};

export type JsxNode = JsxElement | JsxText | JsxExpr;

export type JsxText = { kind: 'text'; value: string };
export type JsxExpr = { kind: 'expr'; value: string | number | boolean };

export type JsxSandboxCode =
  | 'SANDBOX_DISALLOWED_TOKEN'
  | 'SANDBOX_UNTERMINATED_STRING'
  | 'SANDBOX_UNTERMINATED_ELEMENT'
  | 'SANDBOX_MISMATCHED_TAG'
  | 'SANDBOX_INVALID_TAG_NAME'
  | 'SANDBOX_INVALID_ATTR_NAME'
  | 'SANDBOX_INVALID_EXPRESSION'
  | 'SANDBOX_INVALID_BOOLEAN'
  | 'SANDBOX_INVALID_NUMBER'
  | 'SANDBOX_DEPTH_EXCEEDED';

export class JsxSandboxError extends Error {
  readonly code: JsxSandboxCode;
  constructor(code: JsxSandboxCode, message: string) {
    super(message);
    this.name = 'JsxSandboxError';
    this.code = code;
  }
}

export const JSX_MAX_DEPTH = 32;
export const JSX_MAX_NODES = 4096;

/* ─── lexer / parser ─────────────────────────────────────────────── */

/** Forbidden identifiers — any of these appearing in the source is rejected. */
// Tighter forbidden-token list: identifiers that, when accepted into the
// sandbox, would let a hostile snapshot reach the host runtime (network,
// globals, eval, real async/await). We deliberately do NOT block ordinary
// English words like "from" / "return" / "class" — they appear in JSX
// text all the time and blocking them creates false positives. The
// grammar itself forbids the actual dangerous constructs (no function
// bodies, no arrow expressions, no module loading) so a bare identifier
// in text content is harmless.
const FORBIDDEN_TOKENS = [
  'eval',
  'Function',
  'globalThis',
  'window',
  'document',
  'process',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  'Promise',
  'async',
  'await',
  'yield',
  'import',
  'export',
  'require',
  'module',
  'exports',
  'Reflect',
  'Proxy',
  'Symbol',
  'WeakRef',
  'FinalizationRegistry',
];

function isJsxIdentifierChar(c: string, first: boolean): boolean {
  if (first) {
    return /[A-Za-z_$]/.test(c);
  }
  return /[A-Za-z0-9_$]/.test(c);
}

function isJsxWhitespace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r';
}

/** Walk source and ensure no forbidden tokens appear as identifiers. */
function assertNoForbiddenTokens(source: string): void {
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (isJsxIdentifierChar(c, true)) {
      let j = i;
      while (j < source.length && isJsxIdentifierChar(source[j], false)) j++;
      const word = source.slice(i, j);
      // Allow reserved attribute names that begin with `on` (we strip them at render time)
      // but still reject if the exact word matches a forbidden token.
      if (FORBIDDEN_TOKENS.includes(word)) {
        throw new JsxSandboxError(
          'SANDBOX_DISALLOWED_TOKEN',
          `forbidden identifier '${word}' at offset ${i}`
        );
      }
      i = j;
      continue;
    }
    if (c === '<' && source[i + 1] === '!') {
      // HTML comment; skip until -->.
      const end = source.indexOf('-->', i + 2);
      if (end === -1) {
        throw new JsxSandboxError(
          'SANDBOX_DISALLOWED_TOKEN',
          `unterminated HTML comment starting at offset ${i}`
        );
      }
      i = end + 3;
      continue;
    }
    i++;
  }
}

/** Parse the entry source into a root JSX element. Multi-root input
 *  must be a single top-level element — wrap in `<App>...</App>` if needed. */
export function parseJsx(source: string): JsxElement {
  assertNoForbiddenTokens(source);
  const ctx: ParseCtx = { src: source, pos: 0, nodes: 0 };
  skipWsAndComments(ctx);
  if (ctx.pos >= ctx.src.length) {
    throw new JsxSandboxError('SANDBOX_UNTERMINATED_ELEMENT', 'empty source');
  }
  if (ctx.src[ctx.pos] !== '<') {
    throw new JsxSandboxError(
      'SANDBOX_UNTERMINATED_ELEMENT',
      `source must start with '<' (found '${ctx.src[ctx.pos]}')`
    );
  }
  const root = parseElement(ctx);
  skipWsAndComments(ctx);
  if (ctx.pos < ctx.src.length) {
    throw new JsxSandboxError(
      'SANDBOX_UNTERMINATED_ELEMENT',
      `unexpected trailing content at offset ${ctx.pos}`
    );
  }
  return root;
}

type ParseCtx = { src: string; pos: number; nodes: number };

function parseElement(ctx: ParseCtx): JsxElement {
  if (ctx.src[ctx.pos] !== '<') {
    throw new JsxSandboxError('SANDBOX_UNTERMINATED_ELEMENT', `expected '<' at offset ${ctx.pos}`);
  }
  ctx.pos++;
  const tagStart = ctx.pos;
  while (ctx.pos < ctx.src.length && isJsxIdentifierChar(ctx.src[ctx.pos], ctx.pos === tagStart)) {
    ctx.pos++;
  }
  const tag = ctx.src.slice(tagStart, ctx.pos);
  if (!tag || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(tag)) {
    throw new JsxSandboxError('SANDBOX_INVALID_TAG_NAME', `invalid tag name '${tag}'`);
  }
  const attributes: JsxAttribute[] = [];
  let selfClosing = false;
  while (true) {
    skipWsAndComments(ctx);
    if (ctx.pos >= ctx.src.length) {
      throw new JsxSandboxError('SANDBOX_UNTERMINATED_ELEMENT', `unterminated <${tag}`);
    }
    const c = ctx.src[ctx.pos];
    if (c === '/') {
      if (ctx.src[ctx.pos + 1] !== '>') {
        throw new JsxSandboxError('SANDBOX_UNTERMINATED_ELEMENT', `expected '/>' after <${tag}`);
      }
      ctx.pos += 2;
      selfClosing = true;
      break;
    }
    if (c === '>') {
      ctx.pos++;
      break;
    }
    attributes.push(parseAttribute(ctx, tag));
  }
  const children: JsxNode[] = [];
  if (!selfClosing) {
    parseChildren(ctx, tag, children);
  }
  return { tag, selfClosing, attributes, children };
}

function parseAttribute(ctx: ParseCtx, tag: string): JsxAttribute {
  const nameStart = ctx.pos;
  while (ctx.pos < ctx.src.length && isJsxIdentifierChar(ctx.src[ctx.pos], ctx.pos === nameStart)) {
    ctx.pos++;
  }
  const name = ctx.src.slice(nameStart, ctx.pos);
  if (!name || !/^[A-Za-z][A-Za-z0-9_:-]*$/.test(name)) {
    throw new JsxSandboxError('SANDBOX_INVALID_ATTR_NAME', `invalid attribute name '${name}' on <${tag}`);
  }
  skipWsAndComments(ctx);
  if (ctx.src[ctx.pos] !== '=') {
    // bare attribute = boolean true
    return { name, literal: true, isExpr: false };
  }
  ctx.pos++; // consume '='
  skipWsAndComments(ctx);
  const ch = ctx.src[ctx.pos];
  if (ch === '"' || ch === '\'') {
    return { name, literal: parseStringLit(ctx), isExpr: false };
  }
  if (ch === '{') {
    ctx.pos++;
    const expr = parseExpr(ctx);
    if (ctx.src[ctx.pos] !== '}') {
      throw new JsxSandboxError(
        'SANDBOX_INVALID_EXPRESSION',
        `expected '}' to close attribute expression on <${tag} ${name}>`
      );
    }
    ctx.pos++;
    return { name, literal: expr, isExpr: true };
  }
  throw new JsxSandboxError(
    'SANDBOX_INVALID_EXPRESSION',
    `attribute value must be a string literal or {expr} on <${tag} ${name}>`
  );
}

function parseStringLit(ctx: ParseCtx): string {
  const quote = ctx.src[ctx.pos];
  ctx.pos++;
  let out = '';
  while (ctx.pos < ctx.src.length && ctx.src[ctx.pos] !== quote) {
    if (ctx.src[ctx.pos] === '\\') {
      const next = ctx.src[ctx.pos + 1];
      if (next === quote || next === '\\' || next === 'n' || next === 't' || next === 'r') {
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
        ctx.pos += 2;
        continue;
      }
    }
    out += ctx.src[ctx.pos];
    ctx.pos++;
  }
  if (ctx.src[ctx.pos] !== quote) {
    throw new JsxSandboxError('SANDBOX_UNTERMINATED_STRING', `unterminated string at offset ${ctx.pos}`);
  }
  ctx.pos++;
  return out;
}

function parseExpr(ctx: ParseCtx): string | number | boolean | null {
  skipWsAndComments(ctx);
  const start = ctx.pos;
  // string literal inside braces
  const ch = ctx.src[ctx.pos];
  if (ch === '"' || ch === "'") {
    return parseStringLit(ctx);
  }
  // numeric
  if (/[-0-9]/.test(ctx.src[ctx.pos])) {
    while (ctx.pos < ctx.src.length && /[-+0-9.eE]/.test(ctx.src[ctx.pos])) ctx.pos++;
    const raw = ctx.src.slice(start, ctx.pos);
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      throw new JsxSandboxError('SANDBOX_INVALID_NUMBER', `invalid numeric literal '${raw}'`);
    }
    return Number(raw);
  }
  // identifier-based expressions
  if (isJsxIdentifierChar(ctx.src[ctx.pos], true)) {
    while (ctx.pos < ctx.src.length && isJsxIdentifierChar(ctx.src[ctx.pos], false)) ctx.pos++;
    const word = ctx.src.slice(start, ctx.pos);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (word === 'env') {
      skipWsAndComments(ctx);
      if (ctx.src[ctx.pos] !== '.') {
        throw new JsxSandboxError(
          'SANDBOX_INVALID_EXPRESSION',
          `env lookup must be 'env.<NAME>' (got 'env${ctx.src[ctx.pos] ?? '<eof>'}')`
        );
      }
      ctx.pos++;
      const keyStart = ctx.pos;
      while (ctx.pos < ctx.src.length && /[A-Za-z0-9_]/.test(ctx.src[ctx.pos])) ctx.pos++;
      const key = ctx.src.slice(keyStart, ctx.pos);
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        throw new JsxSandboxError(
          'SANDBOX_INVALID_EXPRESSION',
          `env key must be UPPER_SNAKE_CASE (got '${key}')`
        );
      }
      return `__ENV__:${key}`;
    }
    if (word === 'props') {
      // props.<name> — read the identifier after the dot
      skipWsAndComments(ctx);
      if (ctx.src[ctx.pos] !== '.') {
        throw new JsxSandboxError(
          'SANDBOX_INVALID_EXPRESSION',
          `props lookup must be 'props.<name>'`
        );
      }
      ctx.pos++;
      const keyStart = ctx.pos;
      while (ctx.pos < ctx.src.length && /[A-Za-z0-9_]/.test(ctx.src[ctx.pos])) ctx.pos++;
      const key = ctx.src.slice(keyStart, ctx.pos);
      if (!key) {
        throw new JsxSandboxError('SANDBOX_INVALID_EXPRESSION', `props.<name> requires a name`);
      }
      return `__PROPS__:${key}`;
    }
    throw new JsxSandboxError(
      'SANDBOX_INVALID_EXPRESSION',
      `unknown identifier '${word}' in expression`
    );
  }
  throw new JsxSandboxError('SANDBOX_INVALID_EXPRESSION', `unexpected character '${ctx.src[ctx.pos]}' at offset ${ctx.pos}`);
}

function parseChildren(ctx: ParseCtx, parentTag: string, out: Array<JsxNode | string>): void {
  while (true) {
    skipWsAndComments(ctx);
    if (ctx.pos >= ctx.src.length) {
      throw new JsxSandboxError(
        'SANDBOX_UNTERMINATED_ELEMENT',
        `unterminated </${parentTag}> (EOF)`
      );
    }
    if (ctx.src[ctx.pos] === '<' && ctx.src[ctx.pos + 1] === '/') {
      ctx.pos += 2;
      const nameStart = ctx.pos;
      while (ctx.pos < ctx.src.length && isJsxIdentifierChar(ctx.src[ctx.pos], ctx.pos === nameStart)) ctx.pos++;
      const closeTag = ctx.src.slice(nameStart, ctx.pos);
      skipWsAndComments(ctx);
      if (ctx.src[ctx.pos] !== '>') {
        throw new JsxSandboxError(
          'SANDBOX_UNTERMINATED_ELEMENT',
          `expected '>' to close </${parentTag}>`
        );
      }
      ctx.pos++;
      if (closeTag !== parentTag) {
        throw new JsxSandboxError(
          'SANDBOX_MISMATCHED_TAG',
          `mismatched tag: expected </${parentTag}>, got </${closeTag}>`
        );
      }
      return;
    }
    if (ctx.src[ctx.pos] === '<') {
      ctx.nodes++;
      if (ctx.nodes > JSX_MAX_NODES) {
        throw new JsxSandboxError('SANDBOX_DEPTH_EXCEEDED', `node count exceeds ${JSX_MAX_NODES}`);
      }
      out.push(parseElement(ctx));
      continue;
    }
    if (ctx.src[ctx.pos] === '{') {
      ctx.pos++;
      const value = parseExpr(ctx);
      if (ctx.src[ctx.pos] !== '}') {
        throw new JsxSandboxError(
          'SANDBOX_INVALID_EXPRESSION',
          `expected '}' to close child expression`
        );
      }
      ctx.pos++;
      // For boolean/null we drop the child silently (matches React behavior).
      if (value === null || value === false || value === undefined) continue;
      out.push({ kind: 'expr', value });
      continue;
    }
    // text
    const textStart = ctx.pos;
    while (
      ctx.pos < ctx.src.length &&
      ctx.src[ctx.pos] !== '<' &&
      ctx.src[ctx.pos] !== '{'
    ) {
      ctx.pos++;
    }
    const text = ctx.src.slice(textStart, ctx.pos);
    out.push(text);
  }
}

function stringifyExprValue(v: string | number | boolean): string {
  return String(v);
}

function skipWsAndComments(ctx: ParseCtx): void {
  while (ctx.pos < ctx.src.length) {
    const c = ctx.src[ctx.pos];
    if (isJsxWhitespace(c)) {
      ctx.pos++;
      continue;
    }
    if (c === '{' && ctx.src.slice(ctx.pos, ctx.pos + 2) === '{*') {
      // Comment: skip until *}
      const end = ctx.src.indexOf('*}', ctx.pos + 2);
      if (end === -1) {
        throw new JsxSandboxError(
          'SANDBOX_DISALLOWED_TOKEN',
          `unterminated {{* ... *}} comment at offset ${ctx.pos}`
        );
      }
      ctx.pos = end + 2;
      continue;
    }
    return;
  }
}

/* ─── HTML escape helpers ─────────────────────────────────────────── */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"\']/g, (c) => HTML_ESCAPES[c]);
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

/** Attributes that hold JS-handlers — we always strip them in the sandbox
 *  to avoid script injection. */
const EVENT_ATTR_PREFIXES = ['on'];
function isEventAttr(name: string): boolean {
  return name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase();
}

function isIntrinsicTag(tag: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(tag);
}

/* ─── renderer ───────────────────────────────────────────────────── */

export type RenderResult = {
  /** Final HTML string (already escaped). */
  html: string;
  /** True when the render path produced no error but the tree was empty. */
  empty: boolean;
};

export type RenderOptions = {
  /** Inject env values; secrets stay server-side. */
  env?: Record<string, string>;
  /** Component registry (uppercase tag → component function). */
  components?: Record<string, JsxComponent>;
  /** Max render depth (defaults to JSX_MAX_DEPTH). */
  maxDepth?: number;
};

const INTRINSIC_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Render a parsed JSX element to HTML. Components are resolved via
 * the supplied registry; unknown uppercase tags produce a sandbox
 * error (better than silent broken render).
 */
export function renderElement(el: JsxElement, opts: RenderOptions = {}): string {
  return renderElementAt(el, opts, 0);
}

function renderElementAt(el: JsxElement, opts: RenderOptions, depth: number): string {
  const maxDepth = opts.maxDepth ?? JSX_MAX_DEPTH;
  if (depth > maxDepth) {
    throw new JsxSandboxError(
      'SANDBOX_DEPTH_EXCEEDED',
      `render depth exceeds ${maxDepth}`
    );
  }
  const env = opts.env ?? {};
  const components = opts.components ?? {};
  if (!isIntrinsicTag(el.tag) && el.tag[0] === el.tag[0].toUpperCase()) {
    const comp = components[el.tag];
    if (!comp) {
      throw new JsxSandboxError(
        'SANDBOX_INVALID_TAG_NAME',
        `unknown component <${el.tag}>`
      );
    }
    const props = buildProps(el.attributes, env);
    return comp(props, env, (child) => renderElementAt(child, opts, depth + 1));
  }
  return renderIntrinsic(el, env, depth);
}

function buildProps(attrs: JsxAttribute[], env: Record<string, string>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const a of attrs) {
    if (isEventAttr(a.name)) continue; // always strip event handlers
    if (a.isExpr) {
      const raw = a.literal;
      if (typeof raw === 'string' && raw.startsWith('__ENV__:')) {
        props[a.name] = env[raw.slice('__ENV__:'.length)] ?? '';
      } else if (typeof raw === 'string' && raw.startsWith('__PROPS__:')) {
        // props.<x> inside JSX attribute expressions is unusual; we forbid it
        // here because component callers already pass props explicitly.
        throw new JsxSandboxError(
          'SANDBOX_INVALID_EXPRESSION',
          `'props.<x>' is not valid in JSX attributes (use component params instead)`
        );
      } else {
        props[a.name] = raw;
      }
    } else {
      props[a.name] = a.literal;
    }
  }
  return props;
}

function renderIntrinsic(el: JsxElement, env: Record<string, string>, depth: number): string {
  const tag = el.tag;
  const voidTag = INTRINSIC_VOID_TAGS.has(tag);
  const allowAttrs = intrinsicAttrs(tag);
  const parts: string[] = [`<${tag}`];
  for (const a of el.attributes) {
    if (isEventAttr(a.name)) continue;
    if (!allowAttrs.has(a.name)) continue;
    if (a.isExpr) {
      const raw = a.literal;
      if (typeof raw === 'string' && raw.startsWith('__ENV__:')) {
        const v = env[raw.slice('__ENV__:'.length)] ?? '';
        parts.push(` ${a.name}="${escapeAttr(v)}"`);
      } else if (typeof raw === 'string') {
        parts.push(` ${a.name}="${escapeAttr(raw)}"`);
      } else if (typeof raw === 'number' || typeof raw === 'boolean') {
        if (raw === false || raw === null || raw === undefined) continue;
        parts.push(` ${a.name}="${escapeAttr(String(raw))}"`);
      }
      continue;
    }
    if (a.literal === false || a.literal === null || a.literal === undefined) continue;
    if (a.literal === true) {
      parts.push(` ${a.name}`);
      continue;
    }
    parts.push(` ${a.name}="${escapeAttr(String(a.literal))}"`);
  }
  if (voidTag || el.selfClosing) {
    parts.push(el.selfClosing ? '/>' : '>');
    return parts.join('');
  }
  parts.push('>');
  for (const c of el.children) {
    parts.push(renderNode(c, env, depth + 1));
  }
  parts.push(`</${tag}>`);
  return parts.join('');
}

function renderNode(node: JsxNode | string, env: Record<string, string>, depth: number): string {
  if (typeof node === 'string') return escapeHtml(node);
  if ((node as JsxText).kind === 'text') return escapeHtml((node as JsxText).value);
  if ((node as JsxExpr).kind === 'expr') {
    const v = (node as JsxExpr).value;
    if (typeof v === 'string' && v.startsWith('__ENV__:')) {
      return escapeHtml(env[v.slice('__ENV__:'.length)] ?? '');
    }
    return escapeHtml(typeof v === 'string' ? v : String(v));
  }
  return renderElementAt(node as JsxElement, { env }, depth);
}

/* ─── per-tag attribute allow-list ────────────────────────────────── */

const DEFAULT_INTRINSIC_ATTRS = new Set(['id', 'class', 'title', 'role', 'lang', 'dir', 'tabindex', 'style']);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'download']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  button: new Set(['type', 'disabled', 'name', 'value', 'form']),
  input: new Set(['type', 'name', 'value', 'placeholder', 'disabled', 'readonly', 'maxlength', 'minlength', 'pattern', 'required', 'autocomplete']),
  label: new Set(['for']),
  form: new Set(['action', 'method', 'enctype', 'autocomplete']),
  select: new Set(['name', 'disabled', 'required', 'multiple', 'size']),
  option: new Set(['value', 'selected', 'disabled', 'label']),
  textarea: new Set(['name', 'rows', 'cols', 'placeholder', 'disabled', 'readonly', 'required', 'maxlength']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'summary']),
  th: new Set(['scope', 'colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
};

function intrinsicAttrs(tag: string): Set<string> {
  return new Set([...DEFAULT_INTRINSIC_ATTRS, ...(TAG_ATTRS[tag] ?? [])]);
}

/* ─── entry helpers ───────────────────────────────────────────────── */

/**
 * Convenience: render a snapshot source file. Throws `JsxSandboxError`
 * on parse / sandbox violations. Returns empty HTML for an undefined
 * entry so callers don't need to nil-check.
 */
export function renderSnapshotEntry(
  file: SnapshotSourceFile | undefined,
  opts: RenderOptions = {}
): RenderResult {
  if (!file) return { html: '', empty: true };
  try {
    const el = parseJsx(file.content);
    const html = renderElement(el, opts);
    return { html, empty: html.trim().length === 0 };
  } catch (err) {
    if (err instanceof JsxSandboxError) throw err;
    throw err;
  }
}
