/**
 * Runtime SSR renderer tests (R57).
 *
 * Covers: live vs preview mode banners, env.SECRET_KEY injection,
 * Tailwind CDN inclusion, CSP header values, error shells for bad
 * snapshots / bad JSX, empty-entry fallback.
 */
import { describe, expect, it } from 'vitest';
import { buildRuntimeCsp, renderAppHtml } from './ai-app-builder-runtime-ssr';

const APP_NAME = 'TestApp';
const FIXED_TS = new Date('2026-09-03T12:00:00.000Z');

const baseSnapshot = () => ({
  schema: 1,
  app: {
    files: [
      {
        path: 'src/App.tsx',
        content: '<div className="root"><h1>Hi from {env.GREETING}</h1><button>OK</button></div>',
        language: 'tsx',
      },
    ],
    entry: 'src/App.tsx',
    tailwind: false,
  },
});

describe('renderAppHtml — live mode', () => {
  it('renders JSX and stamps Live banner', () => {
    const out = renderAppHtml(baseSnapshot(), {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 7,
      deployedAt: FIXED_TS.toISOString(),
      publicSlug: 'abc123def456',
      secrets: { GREETING: 'Hello world' },
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.html).toContain('<h1>Hi from Hello world</h1>');
      expect(out.html).toContain('Live • TestApp');
      expect(out.html).toContain('abc123def456');
      expect(out.html).toContain('mode=live');
      expect(out.meta.bytes).toBeGreaterThan(0);
      expect(out.meta.empty).toBe(false);
    }
  });
});

describe('renderAppHtml — preview mode', () => {
  it('stamps Preview banner and never leaks secrets in JSON', () => {
    const out = renderAppHtml(baseSnapshot(), {
      mode: 'preview',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      secrets: { GREETING: 'PREVIEW' },
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.html).toContain('Preview • TestApp');
      expect(out.html).toContain('PREVIEW');
      expect(out.html).not.toContain('GREETING=');
    }
  });
});

describe('renderAppHtml — tailwind flag', () => {
  it('injects Tailwind CDN script when tailwind=true', () => {
    const snap = { ...baseSnapshot(), app: { ...baseSnapshot().app, tailwind: true } };
    const out = renderAppHtml(snap, {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.html).toContain('cdn.tailwindcss.com');
    }
  });
});

describe('renderAppHtml — error paths', () => {
  it('reports missing entry file', () => {
    const snap = {
      schema: 1,
      app: {
        files: [{ path: 'src/Other.tsx', content: 'x', language: 'tsx' }],
        entry: 'src/App.tsx',
        tailwind: false,
      },
    };
    const out = renderAppHtml(snap, {
      mode: 'preview',
      appName: APP_NAME,
      versionNumber: 0,
      deployedAt: FIXED_TS.toISOString(),
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('SNAPSHOT_ENTRY_NOT_FOUND');
    }
  });
  it('rejects non-tsx entry', () => {
    const snap = {
      schema: 1,
      app: {
        files: [{ path: 'src/App.tsx', content: 'plain text', language: 'text' }],
        entry: 'src/App.tsx',
        tailwind: false,
      },
    };
    const out = renderAppHtml(snap, {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('RUNTIME_BAD_ENTRY_LANGUAGE');
    }
  });
  it('reports sandbox violation (eval in JSX)', () => {
    const snap = {
      schema: 1,
      app: {
        files: [{ path: 'src/App.tsx', content: '<div>eval</div>', language: 'tsx' }],
        entry: 'src/App.tsx',
        tailwind: false,
      },
    };
    const out = renderAppHtml(snap, {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('SANDBOX_DISALLOWED_TOKEN');
    }
  });
  it('handles empty snapshot gracefully (no files)', () => {
    const out = renderAppHtml({ schema: 1, app: { files: [], entry: 'src/App.tsx' } }, {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('SNAPSHOT_FILES_EMPTY');
    }
  });
});

describe('renderAppHtml — secret escaping', () => {
  it('HTML-escapes env values', () => {
    const snap = {
      schema: 1,
      app: {
        files: [{ path: 'src/App.tsx', content: '<p>{env.SECRET}</p>', language: 'tsx' }],
        entry: 'src/App.tsx',
        tailwind: false,
      },
    };
    const out = renderAppHtml(snap, {
      mode: 'live',
      appName: APP_NAME,
      versionNumber: 1,
      deployedAt: FIXED_TS.toISOString(),
      secrets: { SECRET: '<script>alert(1)</script>' },
      renderedAt: FIXED_TS,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.html).not.toContain('<script>alert(1)</script>');
      expect(out.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });
});

describe('buildRuntimeCsp', () => {
  it('omits Tailwind host when tailwind=false', () => {
    const csp = buildRuntimeCsp({ tailwind: false, entry: 'src/App.tsx' });
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('cdn.tailwindcss.com');
    expect(csp).toContain('frame-ancestors');
  });
  it('includes Tailwind host when tailwind=true', () => {
    const csp = buildRuntimeCsp({ tailwind: true, entry: 'src/App.tsx' });
    expect(csp).toContain('cdn.tailwindcss.com');
  });
});
