/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-3: Mic button rendered next to the ChatPanel composer.
 *
 * States:
 *   idle       → click to start
 *   recording  → click to stop; live mm:ss
 *   ready      → show "Use / Discard" before committing
 *   error      → show toast-like title
 *
 * On commit, calls `onTranscript(text)` with the Whisper result. The
 * parent decides where the text lands — usually the composer input.
 */
'use client';

import * as React from 'react';
import { useState } from 'react';
import { Mic, Square, RotateCcw, Trash2, Check } from 'lucide-react';
import { useVoiceRecorder, type IVoiceRecording } from '../../hooks/useVoiceRecorder';
import { aiChatApi } from './api';

export interface IVoiceButtonProps {
  /** Called with the Whisper transcript when the user commits it. */
  onTranscript: (text: string) => void;
  /** Optional BCP-47 language hint (e.g. 'en', 'zh-CN'). */
  language?: string;
  /** Disable rendering (e.g. while sending). */
  disabled?: boolean;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const VoiceButton: React.FC<IVoiceButtonProps> = ({ onTranscript, language, disabled }) => {
  const recorder = useVoiceRecorder();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleStart = async () => {
    setPreview(null);
    setPreviewError(null);
    await recorder.start();
  };

  const handleStop = async () => {
    const rec: IVoiceRecording | null = await recorder.stop();
    if (!rec) return;
    setBusy(true);
    setPreviewError(null);
    try {
      const result = await aiChatApi.transcribeVoice({
        blob: rec.blob,
        filename: `voice.${rec.mimeType.split('/')[1] ?? 'webm'}`,
        language,
      });
      setPreview(result.text || '');
    } catch (err) {
      setPreviewError((err as Error).message || 'Transcription failed');
      recorder.reset();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    setPreview(null);
    setPreviewError(null);
    recorder.reset();
  };

  const handleCommit = () => {
    if (preview === null) return;
    onTranscript(preview);
    setPreview(null);
    recorder.reset();
  };

  const errorMsg = recorder.error ?? previewError;

  // ── Preview pane ─────────────────────────────────────────────────
  if (preview !== null || errorMsg) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs">
        {errorMsg ? (
          <span className="text-destructive" title={errorMsg}>
            ⚠ {errorMsg}
          </span>
        ) : (
          <span className="max-w-[280px] truncate" title={preview ?? ''}>
            {preview || '(empty transcript)'}
          </span>
        )}
        {!errorMsg && (
          <button
            type="button"
            onClick={handleCommit}
            className="rounded p-1 hover:bg-primary/20"
            aria-label="use transcript"
            title="Use transcript"
          >
            <Check className="h-3.5 w-3.5 text-green-600" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDiscard}
          className="rounded p-1 hover:bg-destructive/20"
          aria-label="discard"
          title="Discard"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
        <button
          type="button"
          onClick={handleStart}
          className="rounded p-1 hover:bg-primary/20"
          aria-label="retry"
          title="Retry"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Idle / recording main button ────────────────────────────────
  if (recorder.phase === 'recording') {
    return (
      <button
        type="button"
        onClick={handleStop}
        disabled={busy}
        className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:opacity-90 disabled:opacity-50"
        aria-label="stop recording"
        title="Stop"
      >
        <Square className="h-3.5 w-3.5" />
        <span>{formatElapsed(recorder.elapsedMs)}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={disabled || busy}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
      aria-label="start voice input"
      title="Voice input"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
};
