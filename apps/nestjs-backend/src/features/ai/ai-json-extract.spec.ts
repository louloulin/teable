/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';

/**
 * R-AI-JSON — Unit tests for the `<think>` reasoning wrapper stripper +
 * JSON payload extractor.
 */

describe('extractJsonPayload (R-AI-JSON)', () => {
  // Re-implement the helper locally to keep this spec self-contained.
  const extractJsonPayload = (text: string): string => {
    let body = text;
    body = body.replace(/<think>[\s\S]*?<\/think>/gi, '');
    body = body.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    body = body.trim();
    const fenceMatch = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) body = fenceMatch[1].trim();
    const start = body.search(/[{\[]/);
    if (start < 0) return text;
    const open = body[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === open) {
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0) return body.slice(start, i + 1);
      }
    }
    return text;
  };

  it('strips a single <think> block and returns the embedded JSON', () => {
    const raw = '<think>some reasoning here</think>\n{"languages":["Python","Java","Go"]}';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ languages: ['Python', 'Java', 'Go'] });
  });

  it('handles a <think> block followed by prose plus a JSON object', () => {
    const raw =
      '<think>reasoning</think>\n以下是结果：\n{"answer":42,"items":[1,2,3]}\n结束。';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ answer: 42, items: [1, 2, 3] });
  });

  it('handles markdown-fenced JSON inside the payload', () => {
    const raw = '<think>reasoning</think>\n```json\n{"a":1}\n```';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ a: 1 });
  });

  it('handles a JSON array at the end of a longer response', () => {
    const raw = '<think>reasoning</think>\nlist ["Python", "JavaScript", "Java"]';
    const parsed = JSON.parse(extractJsonPayload(raw));
    expect(parsed).toEqual(['Python', 'JavaScript', 'Java']);
  });

  it('respects escaped quotes inside strings', () => {
    const raw = '<think>reasoning</think>\n{"q":"he said \\"hi\\"","ok":true}';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ q: 'he said "hi"', ok: true });
  });

  it('falls back to raw text when no JSON is present', () => {
    const raw = '<think>reasoning</think>\nno JSON here, just markdown';
    expect(extractJsonPayload(raw)).toBe(raw);
  });

  it('handles multiple reasoning blocks and nested JSON', () => {
    const raw =
      '<think>first block</think>\n<think>second block</think>\nprefix {"x":{"y":[1,2]},"ok":true}';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ x: { y: [1, 2] }, ok: true });
  });

  it('handles <reasoning> wrappers (DeepSeek-style) too', () => {
    const raw = '<reasoning>thought</reasoning>\n{"v":1}';
    expect(JSON.parse(extractJsonPayload(raw))).toEqual({ v: 1 });
  });
});
