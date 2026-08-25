/**
 * SDK Code Generator (JS/TS) — pure helpers (Stage 117).
 */

import {
  GeneratedSdkFile,
  OpenApiDocument,
  OpenApiOperation,
  OpenApiSchema,
  SDK_JS_DEFAULT_PACKAGE_NAME,
  SDK_JS_DEFAULT_VERSION,
  SdkCodegenResult,
} from './sdk-codegen-js.types';

/** Group operations by tag. */
export function groupByTag(doc: OpenApiDocument): Record<string, OpenApiOperation[]> {
  const out: Record<string, OpenApiOperation[]> = {};
  for (const op of doc.operations) {
    const tag = op.tags?.[0] ?? 'default';
    if (!out[tag]) out[tag] = [];
    out[tag].push(op);
  }
  return out;
}

/** Convert an OpenAPI path to a colon-prefixed JS parameter form (e.g. `/records/{id}` → `/records/:id`). */
export function pathToColonForm(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

/** Generate a TypeScript interface for a schema. */
export function schemaToInterface(schema: OpenApiSchema): string {
  const required = new Set(schema.required);
  const props = schema.properties
    .map((p) => `  ${p.name}${required.has(p.name) ? '' : '?'}: ${p.tsType};`)
    .join('\n');
  return `export interface ${schema.ref} {\n${props}\n}`;
}

/** Generate one method per operation. */
export function opToMethod(op: OpenApiOperation, schemas: ReadonlyMap<string, OpenApiSchema>): string {
  const params: string[] = [];
  if (op.parameters) {
    for (const p of op.parameters) {
      if (p.in === 'path') params.push(`${p.name}: ${tsTypeOf(p)}`);
      else if (p.in === 'query') params.push(`${p.name}?: ${tsTypeOf(p)}`);
    }
  }
  if (op.requestBody) params.push(`body: ${op.requestBody.schemaRef}`);
  const fnName = toCamel(op.operationId);
  const pathFn = pathToColonForm(op.path);
  const argList = params.join(', ');
  const respType = op.responseSchemaRef ?? 'unknown';
  return `  async ${fnName}(${argList}): Promise<${respType}> {
    return this.request<${respType}>('${op.method}', \`${pathFn}\`, ${op.requestBody ? 'body' : 'undefined'});
  }`;
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Compose all generated files into a single result. */
export function generateSdk(input: { doc: OpenApiDocument; packageName?: string; version?: string }): SdkCodegenResult {
  const packageName = input.packageName ?? SDK_JS_DEFAULT_PACKAGE_NAME;
  const version = input.version ?? SDK_JS_DEFAULT_VERSION;
  const schemasByRef = new Map<string, OpenApiSchema>(input.doc.schemas.map((s) => [s.ref, s]));
  const files: GeneratedSdkFile[] = [];

  files.push({ path: 'package.json', content: JSON.stringify({ name: packageName, version, main: 'dist/index.js', types: 'dist/index.d.ts' }, null, 2) });
  files.push({ path: 'src/index.ts', content: generateEntrypoint(input.doc, schemasByRef) });
  files.push({ path: 'src/client.ts', content: generateClient(input.doc) });
  for (const s of input.doc.schemas) files.push({ path: `src/types/${s.ref}.ts`, content: schemaToInterface(s) });
  files.push({ path: 'README.md', content: generateReadme(input.doc, packageName, version) });
  return { packageName, version, files, entrypoint: 'src/index.ts' };
}

function generateEntrypoint(doc: OpenApiDocument, schemas: ReadonlyMap<string, OpenApiSchema>): string {
  const grouped = groupByTag(doc);
  const classes: string[] = [];
  for (const [tag, ops] of Object.entries(grouped)) {
    const className = toPascal(tag);
    const methods = ops.map((op) => opToMethod(op, schemas)).join('\n');
    classes.push(`export class ${className} {
  constructor(private readonly client: SdkClient) {}
${methods}
}`);
  }
  const rootMethods = doc.operations.map((op) => opToMethod(op, schemas)).join('\n');
  return `import { SdkClient } from './client';\n\nexport class TeableSdk {\n${rootMethods}\n  static create(opts: { baseUrl: string; token?: string }): TeableSdk {\n    return new TeableSdk(new SdkClient(opts.baseUrl, opts.token));\n  }\n}\n\n${classes.join('\n\n')}\n`;
}

function generateClient(_doc: OpenApiDocument): string {
  return `export class SdkClient {
  constructor(public readonly baseUrl: string, public readonly token?: string) {}
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: 'Bearer ' + this.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('SDK error ' + res.status);
    return res.json() as Promise<T>;
  }
}\n`;
}

function generateReadme(doc: OpenApiDocument, packageName: string, version: string): string {
  return `# ${packageName} ${version}\n\nAuto-generated SDK for ${doc.title} (${doc.version}).\n`;
}

function toPascal(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (_, c) => c.toUpperCase());
}

// tsTypeOf lives below; referenced above via hoisting.
export function tsTypeOf(p: import('./sdk-codegen-js.types').OpenApiParameter): string {
  return p.type;
}