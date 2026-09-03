/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { describe, expect, it } from 'vitest';
import { CuppyAdapter, buildCuppyAdapter, fileRefToAttachmentId } from './Runtime';

describe('R-AI-CHAT-UI runtime adapter', () => {
  it('builds a real CuppyAdapter', () => {
    expect(buildCuppyAdapter({})).toBeInstanceOf(CuppyAdapter);
  });

  it('returns a completed result when no user message exists', async () => {
    const adapter = buildCuppyAdapter({});
    const updates = [];
    for await (const update of adapter.run({
      messages: [],
      runConfig: {},
      abortSignal: new AbortController().signal,
      context: {},
      config: {},
      unstable_getMessage: () => ({}) as never,
    })) updates.push(update);
    expect(updates.at(-1)?.status).toEqual({ type: 'complete', reason: 'stop' });
  });

  it('prefers attachmentId over fileId for backend extraction', () => {
    expect(fileRefToAttachmentId({ fileId: 'file-1', attachmentId: 'att-1' })).toBe('att-1');
    expect(fileRefToAttachmentId({ fileId: 'file-1' })).toBe('file-1');
  });
});
