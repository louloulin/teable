/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-3: useVoiceRecorder hook test.
 *
 * Stubs MediaRecorder + navigator.mediaDevices so we can verify the
 * state machine transitions without spinning up a real microphone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRecorder } from './useVoiceRecorder';

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mime: string) => mime === 'audio/webm');
  static instances: FakeMediaRecorder[] = [];

  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  state: 'inactive' | 'recording' | 'stopped' = 'inactive';
  mimeType = 'audio/webm';

  constructor(public stream: MediaStream, init?: MediaRecorderOptions) {
    this.mimeType = init?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const fakeStream = {
  getTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream;

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  (globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
    FakeMediaRecorder as unknown as typeof MediaRecorder;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useVoiceRecorder', () => {
  it('starts in idle and can transition to recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.phase).toBe('idle');
    expect(result.current.recording).toBeNull();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('recording');
    expect(result.current.recording).toBeNull();
  });

  it('moves to ready after stop', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.phase).toBe('ready');
    expect(result.current.recording).not.toBeNull();
    expect(result.current.recording?.blob).toBeInstanceOf(Blob);
    expect(result.current.recording?.mimeType).toBe('audio/webm');
  });

  it('reset clears the recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.recording).not.toBeNull();
    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.recording).toBeNull();
  });
});
