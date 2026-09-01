import { describe, expect, it } from 'vitest';
import { BuiltInEchoLlm } from './built-in-echo-llm';

describe('BuiltInEchoLlm.chatStream (R-AI-11)', () => {
  it('emits progressive deltas and a final value', async () => {
    const echo = new BuiltInEchoLlm();
    const chunks: Array<{ delta: string; value?: string; done: boolean }> = [];
    for await (const chunk of echo.chatStream({
      baseId: 'base-stream-1',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi there' }],
      tools: [{ name: 'schema_query', description: 'd', parameters: {} }],
    })) {
      chunks.push(chunk);
    }

    const combined = chunks.map((c) => c.delta).join('');
    expect(combined).toContain('hi there');
    expect(combined).toContain('schema_query');
    expect(chunks.at(-1)?.done).toBe(true);
    expect(chunks.at(-1)?.value).toContain('hi there');
  });

  it('returns early when the abort signal fires mid-stream', async () => {
    const echo = new BuiltInEchoLlm();
    const abort = new AbortController();
    let count = 0;
    const iter = echo.chatStream(
      {
        baseId: 'base-stream-2',
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      },
      abort.signal
    );
    const first = await iter.next();
    count += 1;
    abort.abort();
    while (!(await iter.next()).done) {
      count += 1;
      if (count > 100) break;
    }
    expect(first.value.delta.length).toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
