/* eslint-disable @typescript-eslint/naming-convention */
/**
 * API Explorer — pure helpers that turn a route table into OpenAPI 3.1
 * JSON + an interactive HTML page. Stage 58.
 */

import type {
  HttpMethod,
  IApiExplorerOptions,
  IJsonSchema,
  IOperationObject,
  IOpenApiSpec,
  IRouteParam,
  IRouteResponse,
  IRouteSpec,
} from './api-explorer.types';

export interface IBuildSpecInput {
  routes: ReadonlyArray<IRouteSpec>;
  options: IApiExplorerOptions;
}

export function buildOpenApiSpec(input: IBuildSpecInput): IOpenApiSpec {
  const { routes, options } = input;
  const paths: IOpenApiSpec['paths'] = {};
  for (const route of routes) {
    const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
    if (!paths[route.path]) paths[route.path] = {};
    paths[route.path][method] = toOperation(route, options);
  }
  const spec: IOpenApiSpec = {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version,
      description: options.description,
    },
    paths,
  };
  if (options.baseUrl) {
    spec.servers = [{ url: options.baseUrl }];
  }
  spec.components = {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  };
  return spec;
}

function toOperation(route: IRouteSpec, options: IApiExplorerOptions): IOperationObject {
  const op: IOperationObject = {
    operationId: route.operationId,
    summary: route.summary,
    description: route.description,
    tags: route.tags ?? defaultTags(route.path),
    responses: collectResponses(route.responses),
  };
  if (route.parameters && route.parameters.length > 0) {
    op.parameters = route.parameters.filter((p) => p.in !== 'body').map((p) => stripParam(p));
  }
  if (route.requestBody) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: route.requestBody.schema ?? { type: 'object' } } },
    };
  }
  const authRequired = route.requiresAuth ?? options.requireAuthByDefault ?? true;
  if (authRequired) {
    op.security = [{ bearer: [] }];
  }
  return op;
}

function stripParam(p: IRouteParam): IRouteParam {
  const out: IRouteParam = {
    name: p.name,
    in: p.in,
    required: p.required ?? false,
  };
  if (p.description) out.description = p.description;
  if (p.schema) out.schema = p.schema;
  return out;
}

function collectResponses(
  responses: ReadonlyArray<IRouteResponse> | undefined
): IOperationObject['responses'] {
  const out: IOperationObject['responses'] = {
    '200': { description: 'OK' },
  };
  if (!responses) return out;
  for (const r of responses) {
    const entry: {
      description?: string;
      content?: { 'application/json': { schema: IJsonSchema } };
    } = {
      description: r.description ?? `Status ${r.status}`,
    };
    if (r.schema) {
      entry.content = { 'application/json': { schema: r.schema } };
    }
    out[r.status] = entry;
  }
  return out;
}

function defaultTags(path: string): string[] {
  const seg = path.replace(/^\//, '').split('/')[0] ?? '';
  return [seg || 'default'];
}

/* ------------------------------------------------------------------ */
/*  HTML explorer                                                     */
/* ------------------------------------------------------------------ */

export interface IBuildHtmlInput {
  spec: IOpenApiSpec;
  options: IApiExplorerOptions;
}

export function buildExplorerHtml(input: IBuildHtmlInput): string {
  const { spec, options } = input;
  const groups = groupRoutes(spec);
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    `<title>${esc(options.title)} — API Explorer</title>`,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>',
    explorerCss(),
    '</style>',
    '</head><body>',
    '<header><h1>',
    esc(options.title),
    '</h1>',
    `<p class="meta">v${esc(options.version)} · ${countRoutes(spec)} routes</p>`,
    '<div class="auth"><label>Bearer token</label>',
    '<input id="token" type="text" placeholder="paste access token" autocomplete="off">',
    '</div></header>',
    '<main>',
    ...renderGroups(groups),
    '</main>',
    '<script>',
    explorerJs(),
    '</script>',
    '</body></html>',
  ].join('');
}

interface IRouteGroup {
  tag: string;
  routes: Array<{ method: string; path: string; op: IOperationObject }>;
}

function groupRoutes(spec: IOpenApiSpec): IRouteGroup[] {
  const map = new Map<string, IRouteGroup>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(methods)) {
      const tag = (op.tags && op.tags[0]) || 'default';
      let g = map.get(tag);
      if (!g) {
        g = { tag, routes: [] };
        map.set(tag, g);
      }
      g.routes.push({ method: m.toUpperCase(), path, op });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.tag.localeCompare(b.tag));
}

function renderGroups(groups: IRouteGroup[]): string[] {
  const parts: string[] = [];
  for (const g of groups) {
    parts.push(`<section class="group"><h2>${esc(g.tag)}</h2>`);
    for (const r of g.routes) {
      parts.push(renderRoute(r));
    }
    parts.push('</section>');
  }
  return parts;
}

function renderRoute(r: { method: string; path: string; op: IOperationObject }): string {
  const params = (r.op.parameters ?? [])
    .map(
      (p) =>
        `<label>${esc(p.name)}<input data-param="${esc(p.name)}" placeholder="${esc(
          p.in
        )}"></label>`
    )
    .join('');
  const bodySchema = r.op.requestBody?.content['application/json'].schema;
  const body = bodySchema ? renderSchema(bodySchema, 'body') : '';
  const tryBtn = `<button class="try" data-op="${esc(r.op.operationId)}">Try</button>`;
  const resultSlot = `<pre class="result" data-result="${esc(r.op.operationId)}"></pre>`;
  return `<details class="route">
    <summary><span class="method method-${esc(r.method.toLowerCase())}">${esc(r.method)}</span>
      <code>${esc(r.path)}</code>
      <span class="op">${esc(r.op.operationId)}</span>
    </summary>
    <div class="body">
      <p class="summary">${esc(r.op.summary ?? '')}</p>
      ${body}
      <div class="params">${params}</div>
      ${tryBtn}
      ${resultSlot}
    </div>
  </details>`;
}

function renderSchema(schema: IJsonSchema, kind: string): string {
  if (schema.type === 'object' && schema.properties) {
    const rows = Object.entries(schema.properties)
      .map(
        ([k, v]) =>
          `<label>${esc(k)}<input data-${kind}="${esc(k)}" placeholder="${esc(v.type ?? '')}"></label>`
      )
      .join('');
    return `<fieldset><legend>${esc(kind)}</legend>${rows}</fieldset>`;
  }
  return `<fieldset><legend>${esc(kind)}</legend>
    <textarea data-${kind}-raw placeholder="${esc(schema.type ?? 'string')}"></textarea>
  </fieldset>`;
}

function countRoutes(spec: IOpenApiSpec): number {
  let n = 0;
  for (const m of Object.values(spec.paths)) {
    n += Object.keys(m).length;
  }
  return n;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function explorerCss(): string {
  return `
    :root { color-scheme: light dark; --bg:#fff; --fg:#222; --muted:#888; --border:#e2e2e2; }
    @media (prefers-color-scheme: dark) { :root { --bg:#1a1a1a; --fg:#eee; --muted:#aaa; --border:#333; } }
    body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); }
    header { padding: 16px 24px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); }
    header h1 { margin: 0; font-size: 18px; }
    header .meta { color: var(--muted); font-size: 12px; margin: 4px 0; }
    header .auth { margin-top: 8px; }
    header .auth input { width: 320px; padding: 4px 8px; }
    main { padding: 24px; max-width: 960px; }
    section.group { margin-bottom: 32px; }
    section.group h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 8px; }
    details.route { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; }
    details.route[open] { padding-bottom: 8px; }
    details.route summary { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    details.route summary code { background: transparent; }
    details.route .body { padding: 0 16px 8px; }
    details.route .summary { color: var(--muted); margin: 4px 0; }
    details.route .params, details.route fieldset { display: grid; gap: 4px; margin-top: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 4px; }
    details.route label { display: grid; gap: 4px; font-size: 12px; }
    details.route input, details.route textarea { font: inherit; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); }
    details.route textarea { min-height: 60px; font-family: ui-monospace, monospace; }
    .method { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; color: #fff; }
    .method-get { background: #1f7ae0; }
    .method-post { background: #34a853; }
    .method-put { background: #f6a623; }
    .method-patch { background: #9334e6; }
    .method-delete { background: #d23f31; }
    .op { color: var(--muted); font-size: 12px; margin-left: auto; }
    button.try { padding: 4px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; }
    pre.result { background: #f4f4f4; color: #222; padding: 8px; border-radius: 4px; max-height: 240px; overflow: auto; }
    @media (prefers-color-scheme: dark) { pre.result { background: #0d0d0d; color: #eee; } }
  `;
}

function explorerJs(): string {
  return `
    document.querySelectorAll('details.route').forEach((d) => {
      d.querySelector('button.try')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const op = e.target.dataset.op;
        const det = e.target.closest('details.route');
        const method = det.querySelector('.method').textContent;
        const pathTpl = det.querySelector('code').textContent;
        const params = {};
        det.querySelectorAll('[data-param]').forEach((i) => params[i.dataset.param] = i.value);
        let path = pathTpl;
        for (const [k, v] of Object.entries(params)) {
          path = path.replace('{' + k + '}', encodeURIComponent(v));
        }
        const bodyRaw = det.querySelector('[data-body-raw]')?.value || null;
        const bodyObj = {};
        det.querySelectorAll('[data-body]').forEach((i) => bodyObj[i.dataset.body] = i.value);
        const headers = { 'Content-Type': 'application/json' };
        const tok = document.getElementById('token')?.value.trim();
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        const init = { method, headers };
        if (bodyRaw) init.body = bodyRaw;
        else if (Object.keys(bodyObj).length) init.body = JSON.stringify(bodyObj);
        const out = det.querySelector('[data-result="' + op + '"]');
        out.textContent = 'loading...';
        try {
          const r = await fetch(path, init);
          out.textContent = r.status + ' ' + r.statusText + '\\n' + (await r.text());
        } catch (err) {
          out.textContent = 'ERROR: ' + err.message;
        }
      });
    });
  `;
}

/** Validate that a route spec is well-formed. */
export function validateRouteSpec(spec: IRouteSpec): string[] {
  const errs: string[] = [];
  if (!spec.operationId) errs.push('operationId is required');
  if (!spec.path.startsWith('/')) errs.push('path must start with "/"');
  if (!spec.method) errs.push('method is required');
  if (!spec.summary) errs.push('summary is required');
  return errs;
}

/** Pretty-print JSON for `/api-explorer/openapi.json` GET endpoint. */
export function serializeSpec(spec: IOpenApiSpec): string {
  return JSON.stringify(spec, null, 2);
}
