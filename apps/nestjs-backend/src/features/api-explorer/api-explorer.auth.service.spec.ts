/* eslint-disable @typescript-eslint/naming-convention */
import {
  ApiExplorerAuthService,
  DEFAULT_TEABLE_ROUTES,
  InMemoryRouteCatalog,
} from './api-explorer.auth.service';

describe('ApiExplorerAuthService', () => {
  it('returns OpenAPI JSON', async () => {
    const svc = new ApiExplorerAuthService(new InMemoryRouteCatalog(), {
      title: 'Teable OSS',
      version: '1.0.0',
    });
    const out = await svc.getOpenApiJson();
    expect(out.contentType).toBe('application/json');
    const parsed = JSON.parse(out.body);
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.paths['/api/base']?.get?.operationId).toBe('base.list');
  });
  it('returns explorer HTML', async () => {
    const svc = new ApiExplorerAuthService(new InMemoryRouteCatalog(), {
      title: 'Teable OSS',
      version: '1.0.0',
    });
    const out = await svc.getExplorerHtml();
    expect(out.contentType).toContain('text/html');
    expect(out.body).toContain('Teable OSS — API Explorer');
    expect(out.body).toContain('automation.list');
  });
  it('honours a custom catalog', async () => {
    const catalog = {
      async listRoutes() {
        return [
          {
            operationId: 'custom.thing',
            method: 'GET',
            path: '/api/custom',
            summary: 'Custom',
          },
        ];
      },
    };
    const svc = new ApiExplorerAuthService(catalog, { title: 'T', version: '0.1.0' });
    const out = await svc.getSpec();
    expect(out.paths['/api/custom']?.get?.operationId).toBe('custom.thing');
    expect(out.paths['/api/base']).toBeUndefined();
  });
  it('exposes the default Teable route catalogue', () => {
    expect(DEFAULT_TEABLE_ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_TEABLE_ROUTES.some((r) => r.operationId === 'table.create')).toBe(true);
  });
});
