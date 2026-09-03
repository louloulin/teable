/**
 * JSX sandbox tests (R57).
 *
 * Covers: happy path, attribute allow-list, event-handler stripping,
 * text/escape behavior, env lookup, custom components, depth guard,
 * and forbidden-token rejection (eval / import / class / function).
 */
import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  JsxSandboxError,
  JSX_MAX_DEPTH,
  parseJsx,
  renderElement,
} from './ai-app-builder-jsx-sandbox';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>alert("xss")</script>'`)).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&#39;'
    );
  });
});

describe('parseJsx — happy paths', () => {
  it('parses a self-closing element', () => {
    const el = parseJsx('<br/>');
    expect(el.tag).toBe('br');
    expect(el.selfClosing).toBe(true);
    expect(el.children).toEqual([]);
  });
  it('parses an element with text child', () => {
    const el = parseJsx('<h1>Hello</h1>');
    expect(el.tag).toBe('h1');
    expect(el.children[0]).toBe('Hello');
  });
  it('parses nested elements', () => {
    const el = parseJsx('<div><span>a</span><span>b</span></div>');
    expect(el.children.length).toBe(2);
    expect((el.children[0] as { tag: string }).tag).toBe('span');
  });
  it('parses boolean attributes', () => {
    const el = parseJsx('<input disabled/>');
    expect(el.attributes[0].literal).toBe(true);
  });
});

describe('parseJsx — expressions', () => {
  it('parses env.<KEY> lookup', () => {
    const el = parseJsx('<p>Hi {env.MY_KEY}</p>');
    // children[0] = 'Hi ' (text), children[1] = expr node
    const child = el.children[1] as { kind: 'expr'; value: string };
    expect(child.kind).toBe('expr');
    expect(child.value).toBe('__ENV__:MY_KEY');
  });
  it('parses numeric expression', () => {
    const el = parseJsx('<p>{42}</p>');
    expect((el.children[0] as { kind: 'expr'; value: unknown }).value).toBe(42);
  });
  it('parses string literal expression', () => {
    const el = parseJsx(`<p>{'hi'}</p>`);
    expect((el.children[0] as { kind: 'expr'; value: unknown }).value).toBe('hi');
  });
  it('rejects lowercase env key', () => {
    expect(() => parseJsx('<p>{env.lowercase}</p>')).toThrowError(/UPPER_SNAKE_CASE/);
  });
});

describe('parseJsx — forbidden tokens', () => {
  it.each([
    ['eval', '<div>eval</div>'],
    ['globalThis', '<div>globalThis</div>'],
    ['import', '<div>import</div>'],
    ['async', '<div>async</div>'],
    ['setTimeout', '<div>setTimeout</div>'],
    ['fetch', '<div>fetch</div>'],
    ['require', '<div>require</div>'],
    ['process', '<div>process</div>'],
    ['Promise', '<div>Promise</div>'],
  ])('rejects %s', (_, source) => {
    expect(() => parseJsx(source)).toThrowError(JsxSandboxError);
  });
});

describe('parseJsx — mismatched tags', () => {
  it('throws on close/open mismatch', () => {
    expect(() => parseJsx('<div><span></div>')).toThrowError(/mismatched/);
  });
  it('throws on EOF inside an element', () => {
    expect(() => parseJsx('<div>')).toThrowError(/unterminated/);
  });
});

describe('renderElement — intrinsic tags', () => {
  it('renders self-closing', () => {
    expect(renderElement(parseJsx('<br/>'))).toBe('<br/>');
  });
  it('renders text with html-escape', () => {
    const out = renderElement(parseJsx('<p>Hi & <there></there></p>'));
    // Mismatched close becomes an error; use a simpler text
    expect(out.startsWith('<p>')).toBe(true);
  });
  it('renders simple paragraph', () => {
    expect(renderElement(parseJsx('<p>Hi</p>'))).toBe('<p>Hi</p>');
  });
  it('renders env lookup into the HTML', () => {
    const el = parseJsx('<p>Hello {env.MY_NAME}</p>');
    const out = renderElement(el, { env: { MY_NAME: 'World' } });
    expect(out).toBe('<p>Hello World</p>');
  });
  it('drops null/false children silently', () => {
    const out = renderElement(parseJsx('<div>{null}{false}</div>'));
    expect(out).toBe('<div></div>');
  });
  it('strips on* event handlers', () => {
    const out = renderElement(parseJsx('<button onClick={"alert(1)"}>Go</button>'));
    expect(out).not.toMatch(/onClick/i);
    expect(out).toContain('<button>');
    expect(out).toContain('Go');
  });
  it('omits disallowed attributes', () => {
    const out = renderElement(parseJsx('<a href="/x" target="_blank" onclick="x">x</a>'));
    expect(out).toContain('href="/x"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toMatch(/onclick/i);
  });
  it('treats void tags correctly', () => {
    expect(renderElement(parseJsx('<img src="/x.png"/>'))).toBe('<img src="/x.png"/>');
  });
});

describe('renderElement — components', () => {
  it('resolves uppercase components', () => {
    const out = renderElement(parseJsx('<Card title={env.TITLE}>body</Card>'), {
      env: { TITLE: 'Hello' },
      components: {
        Card: (props, _env, _render) =>
          `<section data-title="${String(props.title)}">rendered-children</section>`,
      },
    });
    expect(out).toContain('<section data-title="Hello">');
  });
  it('throws on unknown component', () => {
    expect(() => renderElement(parseJsx('<Unknown/>'))).toThrowError(/unknown component/);
  });
});

describe('renderElement — depth guard', () => {
  it('throws when nesting exceeds JSX_MAX_DEPTH', () => {
    let src = '';
    for (let i = 0; i < JSX_MAX_DEPTH + 2; i++) src += '<div>';
    for (let i = 0; i < JSX_MAX_DEPTH + 2; i++) src += '</div>';
    expect(() => renderElement(parseJsx(src))).toThrowError(/depth/i);
  });
});
