/**
 * SDK Code Generator (Python) — pure helpers (Stage 118).
 */

import {
  GeneratedPyFile,
  OpenApiDocumentPy,
  OpenApiOperationPy,
  OpenApiSchemaPy,
  PyCodegenResult,
  SDK_PY_DEFAULT_PACKAGE,
  SDK_PY_DEFAULT_VERSION,
} from './sdk-codegen-py.types';

/** Map JS type → Python type annotation. */
export function jsTypeToPy(t: string): string {
  if (t === 'string') return 'str';
  if (t === 'number') return 'float';
  if (t === 'boolean') return 'bool';
  if (t === 'integer') return 'int';
  return 'Any';
}

/** Convert OpenAPI path with `{x}` braces to f-string-friendly `:x` style. */
export function pathToFString(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_m, p) => `{${p}}`);
}

/** Generate Python dataclass for a schema. */
export function schemaToDataclass(schema: OpenApiSchemaPy): string {
  const required = new Set(schema.required);
  const fields = schema.properties
    .map((p) => {
      const ann = jsTypeToPy(p.pyType);
      return `    ${p.name}: ${required.has(p.name) ? ann : `Optional[${ann}]`} = None`;
    })
    .join('\n');
  return `@dataclass\nclass ${schema.ref}:\n${fields || '    pass'}\n`;
}

/** Generate one async method per operation. */
export function opToAsyncMethod(op: OpenApiOperationPy): string {
  const params: string[] = ['self'];
  if (op.parameters) {
    for (const p of op.parameters) {
      const ann = jsTypeToPy(p.type);
      if (p.in === 'path') params.push(`${p.name}: ${ann}`);
      else if (p.in === 'query') params.push(`${p.name}: Optional[${ann}] = None`);
    }
  }
  if (op.requestBody) params.push(`body: ${op.requestBody.schemaRef}`);
  const fnName = toSnake(op.operationId);
  const pathStr = pathToFString(op.path);
  const respType = op.responseSchemaRef ? jsTypeToPy(op.responseSchemaRef) : 'Any';
  return `    async def ${fnName}(${params.join(', ')}) -> ${respType}:
        return await self._request("${op.method}", f${pathStr}${op.requestBody ? ', body=body' : ''})
`;
}

function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()).replace(/^_/, '');
}

/** Group operations by tag. */
export function groupByTagPy(doc: OpenApiDocumentPy): Record<string, OpenApiOperationPy[]> {
  const out: Record<string, OpenApiOperationPy[]> = {};
  for (const op of doc.operations) {
    const tag = op.tags?.[0] ?? 'default';
    if (!out[tag]) out[tag] = [];
    out[tag].push(op);
  }
  return out;
}

function toPascal(s: string): string {
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\s+(.)/g, (_m, c) => c.toUpperCase())
    .replace(/^(.)/, (_m, c) => c.toUpperCase())
    .replace(/\s/g, '');
}

/** Compose generated files. */
export function generatePySdk(input: { doc: OpenApiDocumentPy; packageName?: string; version?: string }): PyCodegenResult {
  const packageName = input.packageName ?? SDK_PY_DEFAULT_PACKAGE;
  const version = input.version ?? SDK_PY_DEFAULT_VERSION;
  const files: GeneratedPyFile[] = [];

  files.push({ path: 'pyproject.toml', content: generatePyproject(packageName, version) });
  files.push({ path: `${packageName}/__init__.py`, content: `from .client import TeableSdk\n__version__ = "${version}"\n` });
  files.push({ path: `${packageName}/client.py`, content: generateClient() });
  files.push({ path: `${packageName}/models.py`, content: generateModels(input.doc.schemas) });
  files.push({ path: `${packageName}/api.py`, content: generateApi(input.doc) });
  files.push({ path: 'README.md', content: `# ${packageName} ${version}\n\nAuto-generated Python SDK.\n` });
  return { packageName, version, files, entrypoint: `${packageName}/__init__.py` };
}

function generatePyproject(pkg: string, version: string): string {
  return `[project]\nname = "${pkg}"\nversion = "${version}"\nrequires-python = ">=3.9"\ndependencies = ["httpx>=0.25"]\n`;
}

function generateClient(): string {
  return `import httpx
from typing import Any, Optional

class TeableSdk:
    def __init__(self, base_url: str, token: Optional[str] = None):
        self.base_url = base_url
        self.token = token
        self._client = httpx.AsyncClient()

    async def _request(self, method: str, path: str, body: Any = None) -> Any:
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = "Bearer " + self.token
        resp = await self._client.request(method, self.base_url + path, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()
`;
}

function generateModels(schemas: readonly OpenApiSchemaPy[]): string {
  const head = `from dataclasses import dataclass\nfrom typing import Any, Optional\n\n`;
  return head + schemas.map(schemaToDataclass).join('\n');
}

function generateApi(doc: OpenApiDocumentPy): string {
  const grouped = groupByTagPy(doc);
  const classes: string[] = [];
  for (const [tag, ops] of Object.entries(grouped)) {
    const className = toPascal(tag);
    const methods = ops.map(opToAsyncMethod).join('');
    classes.push(`class ${className}Api:
    def __init__(self, sdk: TeableSdk):
        self._sdk = sdk
${methods}
`);
  }
  return classes.join('\n');
}