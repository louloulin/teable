/**
 * Tool bridge tests (R58).
 *
 * Covers: descriptor → wire format conversion, wire → parsed args
 * (with bad JSON resilience), streamed-delta merging, citation hint
 * extraction, and budget enforcement for the tool loop.
 */
import { describe, expect, it } from 'vitest';
import {
  canContinueToolLoop,
  DEFAULT_TOOL_LOOP_BUDGET,
  mergeStreamedToolCallDeltas,
  parseAssistantToolCalls,
  toolResultMessage,
  toolsToOpenAIFunctions,
} from './ai-chat-tool-bridge';

describe('toolsToOpenAIFunctions', () => {
  it('maps internal descriptors to wire format', () => {
    const out = toolsToOpenAIFunctions([
      {
        name: 'schema_query',
        description: 'List tables',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'record_query',
        description: 'Read records',
        parameters: { type: 'object', properties: { tableId: { type: 'string' } } },
      },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      type: 'function',
      function: {
        name: 'schema_query',
        description: 'List tables',
        parameters: { type: 'object', properties: {} },
      },
    });
  });
  it('deduplicates names', () => {
    const out = toolsToOpenAIFunctions([
      { name: 'dup', description: 'a', parameters: {} },
      { name: 'dup', description: 'b', parameters: {} },
    ]);
    expect(out.length).toBe(1);
  });
  it('skips tools with invalid names', () => {
    const out = toolsToOpenAIFunctions([
      { name: '', description: 'x', parameters: {} },
      { name: 'ok', description: 'y', parameters: {} },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].function.name).toBe('ok');
  });
  it('returns [] for empty input', () => {
    expect(toolsToOpenAIFunctions([])).toEqual([]);
  });
});

describe('parseAssistantToolCalls', () => {
  it('parses valid tool call JSON arguments', () => {
    const out = parseAssistantToolCalls([
      { id: 'tc_1', name: 'record_query', arguments: '{"tableId":"tbl_x","take":5}' },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].args).toEqual({ tableId: 'tbl_x', take: 5 });
    expect(out[0].citation?.table).toBe('tbl_x');
  });
  it('captures malformed JSON as empty args + raw JSON', () => {
    const out = parseAssistantToolCalls([
      { id: 'tc_1', name: 'f', arguments: '{not-json' },
    ]);
    expect(out[0].args).toEqual({});
    expect(out[0].argumentsJson).toBe('{not-json');
  });
  it('returns [] when tool_calls is undefined or empty', () => {
    expect(parseAssistantToolCalls(undefined)).toEqual([]);
    expect(parseAssistantToolCalls([])).toEqual([]);
  });
});

describe('mergeStreamedToolCallDeltas', () => {
  it('merges by index across deltas', () => {
    const out = mergeStreamedToolCallDeltas([
      { index: 0, id: 'tc_1', name: 'record_query', arguments: '{"tableId":' },
      { index: 0, arguments: '"tbl_x"}' },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('record_query');
    expect(out[0].args).toEqual({ tableId: 'tbl_x' });
  });
  it('handles parallel tool calls with different indices', () => {
    const out = mergeStreamedToolCallDeltas([
      { index: 0, id: 'tc_1', name: 'record_query', arguments: '{"a":1}' },
      { index: 1, id: 'tc_2', name: 'schema_query', arguments: '{"b":2}' },
    ]);
    expect(out.length).toBe(2);
    const names = out.map((o) => o.name).sort();
    expect(names).toEqual(['record_query', 'schema_query']);
  });
});

describe('toolResultMessage', () => {
  it('serialises result as JSON content with tool_call_id', () => {
    const call = {
      id: 'tc_1',
      name: 'record_query',
      args: {},
      argumentsJson: '{}',
      citation: null,
    };
    const msg = toolResultMessage(call, { records: [{ id: 'r1' }] });
    expect(msg.role).toBe('tool');
    expect(msg.tool_call_id).toBe('tc_1');
    expect(JSON.parse(msg.content as string)).toEqual({ records: [{ id: 'r1' }] });
  });
  it('truncates oversize content', () => {
    const call = {
      id: 'tc_1',
      name: 'f',
      args: {},
      argumentsJson: '{}',
      citation: null,
    };
    const huge = 'x'.repeat(64 * 1024);
    const msg = toolResultMessage(call, huge);
    expect((msg.content as string).length).toBeLessThanOrEqual(32 * 1024);
  });
});

describe('canContinueToolLoop', () => {
  it('allows continuation under budget', () => {
    expect(canContinueToolLoop(DEFAULT_TOOL_LOOP_BUDGET, { steps: 1, toolCalls: 1, startedAt: 0 }, 100)).toEqual({ ok: true });
  });
  it('blocks when steps exhausted', () => {
    expect(
      canContinueToolLoop(DEFAULT_TOOL_LOOP_BUDGET, { steps: 4, toolCalls: 1, startedAt: 0 }, 100)
    ).toEqual({ ok: false, reason: 'STEPS_EXCEEDED' });
  });
  it('blocks when tool calls exhausted', () => {
    expect(
      canContinueToolLoop(DEFAULT_TOOL_LOOP_BUDGET, { steps: 1, toolCalls: 12, startedAt: 0 }, 100)
    ).toEqual({ ok: false, reason: 'TOOL_CALLS_EXCEEDED' });
  });
  it('blocks when duration exceeded', () => {
    expect(
      canContinueToolLoop(DEFAULT_TOOL_LOOP_BUDGET, { steps: 1, toolCalls: 1, startedAt: 0 }, 60_000)
    ).toEqual({ ok: false, reason: 'DURATION_EXCEEDED' });
  });
});
