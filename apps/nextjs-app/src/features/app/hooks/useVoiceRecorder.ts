/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-3: MediaRecorder-backed voice capture hook.
 *
 * Wraps the browser MediaRecorder API into a tiny React state machine:
 *   idle → recording → ready (with blob) | error
 *
 * Picks the first supported MIME type out of a sensible preference
 * list (webm/ogg/mp4) so it works on Chromium, Firefox, and Safari.
 *
 * Recording stops automatically after `maxDurationMs` (default 60s) so a
 * forgotten mic doesn't blow past OpenAI's 25MB upload cap.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoicePhase = 'idle' | 'recording' | 'ready' | 'error';

export interface IVoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface IUseVoiceRecorder {
  phase: VoicePhase;
  recording: IVoiceRecording | null;
  error: string | null;
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<IVoiceRecording | null>;
  cancel: () => void;
  reset: () => void;
}

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const candidate of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

export function useVoiceRecorder(maxDurationMs = 60_000): IUseVoiceRecorder {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [recording, setRecording] = useState<IVoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const stopResolveRef = useRef<((r: IVoiceRecording | null) => void) | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setRecording(null);
    setElapsedMs(0);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setError('Microphone access is not available in this browser context.');
      setPhase('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const result: IVoiceRecording = {
          blob,
          mimeType: recorder.mimeType || 'audio/webm',
          durationMs: Date.now() - startedAtRef.current,
        };
        cleanup();
        setRecording(result);
        setPhase('ready');
        if (stopResolveRef.current) {
          stopResolveRef.current(result);
          stopResolveRef.current = null;
        }
      };
      recorder.onerror = (e: Event) => {
        cleanup();
        setError(`Recorder error: ${e instanceof Event ? (e as ErrorEvent).message : 'unknown'}`);
        setPhase('error');
        if (stopResolveRef.current) {
          stopResolveRef.current(null);
          stopResolveRef.current = null;
        }
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase('recording');
      tickRef.current = setInterval(() => {
        const dt = Date.now() - startedAtRef.current;
        setElapsedMs(dt);
        if (dt >= maxDurationMs && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 100);
    } catch (err) {
      cleanup();
      setError((err as Error).message || 'Failed to access microphone');
      setPhase('error');
    }
  }, [cleanup, maxDurationMs]);

  const stop = useCallback((): Promise<IVoiceRecording | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(recording);
        return;
      }
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, [recording]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    cleanup();
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // swallow — already stopping
      }
    }
    setRecording(null);
    setPhase('idle');
    setElapsedMs(0);
  }, [cleanup]);

  const reset = useCallback(() => {
    setRecording(null);
    setError(null);
    setPhase('idle');
    setElapsedMs(0);
  }, []);

  return { phase, recording, error, elapsedMs, start, stop, cancel, reset };
}
