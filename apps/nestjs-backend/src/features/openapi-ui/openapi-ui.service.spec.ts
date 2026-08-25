/**
 * OpenAPI UI — pure helpers spec (Stage 106).
 */

import {
  escapeHtml,
  groupByVerb,
  isSafeRelativePath,
  renderBootstrapScript,
  renderEndpoint,
  renderHeader,
  renderHtmlDocument,
  renderOperationsSection,
  renderPage,
  renderSchemasSection,
  validateEndpointMarkup,
} from './openapi-ui.service';
import type { IOpenApiDocument, IOperationSpec } from '../openapi-metadata/openapi-metadata.types';

function op(over: Partial<IOperationSpec> = {}): IOperationSpec {
  return {
    operationId: 'p.list',
    resource: 'p',
    verb: 'GET',
    path: '/p',
    summary: 'list p',
    authRequired: false,
    params: [],
    responses: [{ status: 200, schema: 'P' }],
    ...over,
  };
}

describe('openapi-ui.escapeHtml', () => {
  it('escapes', () => {
    expect(escapeHtml('<a href="x">"&"</a>')).toContain('&lt;');
    expect(escapeHtml('<a href="x">"&"</a>')).toContain('&quot;');
    expect(escapeHtml('<a href="x">"&"</a>')).toContain('&amp;');
  });
});

describe('openapi-ui.renderEndpoint / renderHeader', () => {
  it('renders endpoint', () => {
    const r = renderEndpoint(op());
    expect(r.markup).toContain('<li');
    expect(r.markup).toContain('GET');
    expect(r.markup).toContain('/p');
  });
  it('renders endpoint auth badge', () => {
    const r = renderEndpoint(op({ authRequired: true }));
    expect(r.markup).toContain('badge auth');
  });
  it('header', () => {
    const h = renderHeader({ title: 'T', version: '1', jsonPath: '/api/t.openapi.json' });
    expect(h.markup).toContain('<h1>T');
    expect(h.markup).toContain('v1');
  });
});

describe('openapi-ui.groupByVerb / renderOperationsSection / renderSchemasSection', () => {
  it('groupByVerb', () => {
    const g = groupByVerb([op({ verb: 'GET' }), op({ operationId: 'p.create', verb: 'POST' })]);
    expect(Object.keys(g).sort()).toEqual(['GET', 'POST']);
  });
  it('renderOperationsSection', () => {
    const s = renderOperationsSection([op()]);
    expect(s.body).toContain('class="ops"');
    expect(s.body).toContain('/p');
  });
  it('renderSchemasSection empty', () => {
    const s = renderSchemasSection({});
    expect(s.body).toContain('No schemas');
  });
  it('renderSchemasSection populated', () => {
    const s = renderSchemasSection({ A: 'A' });
    expect(s.body).toContain('<code>A</code>');
  });
});

describe('openapi-ui.renderBootstrapScript / renderPage / renderHtmlDocument', () => {
  it('script', () => {
    const s = renderBootstrapScript({ jsonPath: '/api/t.openapi.json' });
    expect(s).toContain("fetch('/api/t.openapi.json')");
  });
  it('renderPage', () => {
    const doc: IOpenApiDocument = { title: 'T', version: '1', operations: [op()], schemas: {} };
    const page = renderPage({ doc, jsonPath: '/api/t.openapi.json' });
    expect(page.sections.length).toBe(2);
  });
  it('renderHtmlDocument', () => {
    const doc: IOpenApiDocument = { title: 'T', version: '1', operations: [op()], schemas: {} };
    const html = renderHtmlDocument({ doc, jsonPath: '/api/t.openapi.json' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('T');
  });
});

describe('openapi-ui.validateEndpointMarkup / isSafeRelativePath', () => {
  it('validate ok', () => {
    expect(validateEndpointMarkup('<li></li>')).toBeNull();
  });
  it('safe path', () => {
    expect(isSafeRelativePath('/api/x')).toBe(true);
    expect(isSafeRelativePath('http://x')).toBe(false);
    expect(isSafeRelativePath('no-slash')).toBe(false);
  });
});
