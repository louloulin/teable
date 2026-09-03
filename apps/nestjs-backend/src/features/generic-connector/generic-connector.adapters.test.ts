import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('../../utils/ssrf-http', () => ({ safeFetch }));

import { csvUrlAdapter, jsonEndpointAdapter } from './generic-connector.adapters';

describe('generic connector endpoint policy', () => {
  beforeEach(() => safeFetch.mockReset());

  it('rejects loopback endpoints before making a request', async () => {
    const result = await jsonEndpointAdapter({
      adapterType: 'json-endpoint',
      endpoint: 'http://127.0.0.1/admin',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private or loopback/);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('rejects non-http protocols', async () => {
    const result = await csvUrlAdapter({
      adapterType: 'csv-url',
      endpoint: 'file:///etc/passwd',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/protocol must be http/);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
