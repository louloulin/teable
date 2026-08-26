/**
 * StreamingAiCell — Round 12 T-14.
 *
 * Renders a live AI cell while tokens stream from the SSE endpoint. When
 * `streaming` is true, the static children are hidden and the streamed text
 * is shown with a blinking caret plus a Stop button that calls `abort()`.
 * When `streaming` is false, the children render normally (the static cell
 * underneath) and this component contributes nothing to the layout.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies — uses the browser-native `fetch` + `TextDecoder`
 *     through the existing `useStreamingAI` hook.
 *   - The static cell rendering is preserved by passing it as `children`
 *     and rendering it only when the stream is not active.
 *   - Existing ai.controller.ts / ai.service.ts / useStreamingAI.ts are
 *     untouched.
 */
import { X } from '@teable/icons';
import { Button, cn } from '@teable/ui-lib';
import { useEffect } from 'react';
import { useStreamingAI } from '@/features/app/hooks/useStreamingAI';

export interface IStreamingAiCellProps {
  baseId: string;
  fieldId: string;
  tableId: string;
  recordId: string;
  /**
   * When true, opens the SSE stream and renders the streamed text. When
   * false, the children are rendered as-is.
   */
  streaming: boolean;
  /**
   * Static fallback content (typically the cell value or a placeholder).
   * Rendered when `streaming` is false.
   */
  children?: React.ReactNode;
  /**
   * Position the streaming overlay over the cell. Mirrors the positioning
   * style used by `AiGenerateButton`.
   */
  style?: React.CSSProperties;
  /**
   * Called when the stream finishes naturally (not aborted). Lets the
   * parent hand off to the static cell rendering without flickering.
   */
  onDone?: (value: string) => void;
  /**
   * Called when the user clicks Stop. Lets the parent clear the streaming
   * flag and revert to the static cell.
   */
  onAbort?: () => void;
  className?: string;
}

export const StreamingAiCell = (props: IStreamingAiCellProps) => {
  const {
    baseId,
    fieldId,
    tableId,
    recordId,
    streaming,
    children,
    style,
    onDone,
    onAbort,
    className,
  } = props;
  const {
    streaming: isStreaming,
    value,
    done,
    start,
    abort,
  } = useStreamingAI({
    baseId,
    fieldId,
    tableId,
    recordId,
  });

  // Open/close the stream when the parent toggles `streaming`.
  useEffect(() => {
    if (streaming) {
      start();
    }
    return () => {
      if (isStreaming) {
        abort();
      }
    };
    // We intentionally only react to the parent's `streaming` flag —
    // re-running on every `isStreaming` toggle would start duplicate
    // streams when the stream closes naturally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // Notify the parent when the stream finishes.
  useEffect(() => {
    if (done) {
      onDone?.(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!streaming) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex items-start rounded-sm bg-background/95 p-2 text-[13px] leading-5',
        className
      )}
      style={style}
      data-testid="streaming-ai-cell"
    >
      <div className="flex min-w-0 flex-1 items-start gap-1 overflow-hidden">
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {value}
          <span
            aria-hidden
            className={cn(
              'ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-current align-baseline',
              'animate-pulse'
            )}
          />
        </span>
      </div>
      <Button
        variant="outline"
        size="icon-xs"
        onClick={() => {
          abort();
          onAbort?.();
        }}
        aria-label="Stop streaming"
        className="ml-1 shrink-0"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
};
