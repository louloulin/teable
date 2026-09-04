/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-CHAT-UI — assistant-ui 0.10 based Cuppy panel.
 *
 * This file uses the real assistant-ui primitives rather than a look-alike
 * local component: `useLocalRuntime`, `AssistantRuntimeProvider`,
 * `ThreadPrimitive`, `MessagePrimitive`, and `ComposerPrimitive`.
 */
import * as React from 'react';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useMessage,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { Paperclip, Send, Sparkles } from 'lucide-react';
import { VoiceButton } from '../VoiceButton';

import { useChatPanelStore } from '../../sidebar/useChatPanelStore';
import { buildCuppyAdapter } from './Runtime';
import { formatGridSelectionForChat } from '../../../blocks/view/grid/utils/gridSelectionChat';
import { ReactQueryKeys } from '@teable/sdk/config';
import { SelectionChips } from '../SelectionChips';
import { IntelligenceMenu } from '../IntelligenceMenu';
import { ModelSelect } from '../ModelSelect';
import { useAiChatSessionStore } from '../useAiChatSessionStore';

export interface ChatPanelProps {
  baseId?: string;
  className?: string;
}

export const createCuppyRuntime = (input: Parameters<typeof buildCuppyAdapter>[0]) =>
  buildCuppyAdapter(input);

const UserMessage: React.FC = () => (
  <MessagePrimitive.Root className="ml-6 rounded-lg bg-primary/10 p-3 text-sm">
    <div className="mb-1 text-xs text-muted-foreground">You</div>
    <MessagePrimitive.Parts />
  </MessagePrimitive.Root>
);

const AssistantMessage: React.FC = () => {
  const status = useMessage((message) => message.status);
  return (
    <MessagePrimitive.Root className="mr-6 rounded-lg bg-muted p-3 text-sm">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Cuppy
      </div>
      <MessagePrimitive.Parts />
      {status?.type === 'running' && <span className="mt-1 inline-block animate-pulse">▍</span>}
    </MessagePrimitive.Root>
  );
};

const ThreadMessages: React.FC = () => (
  <ThreadPrimitive.Messages
    components={{
      UserMessage,
      AssistantMessage,
      SystemMessage: AssistantMessage,
    }}
  />
);

const CuppyComposer: React.FC = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Listen for R-CHAT-3 voice transcripts dispatched as CustomEvent on window
  // (set by VoiceButton outside the composer context if needed). The
  // recommended path is the per-instance onTranscript prop below.
  const [transcript, setTranscript] = React.useState<string>('');

  const handleVoice = React.useCallback((text: string) => {
    setTranscript((prev) => (prev ? prev + ' ' : '') + text);
    requestAnimationFrame(() => {
      const el = inputRef.current as HTMLInputElement | null;
      if (el) {
        el.value = (el.value ? el.value + ' ' : '') + text;
        el.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }, []);

  return (
    <ComposerPrimitive.Root className="border-t bg-background p-2">
      <div className="flex items-end gap-2">
        <ComposerPrimitive.Input
          autoFocus
          submitOnEnter
          placeholder="Ask Cuppy…"
          className="min-h-10 flex-1 resize-none rounded border bg-transparent p-2 text-sm outline-none"
          ref={inputRef}
        />
        <ComposerPrimitive.AddAttachment
          multiple
          className="rounded p-2 hover:bg-muted"
          aria-label="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </ComposerPrimitive.AddAttachment>
        <VoiceButton onTranscript={handleVoice} />
        <ComposerPrimitive.Send
          className="rounded bg-primary p-2 text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </div>
      {transcript && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          <span>Voice transcript staged: {transcript.slice(0, 60)}{transcript.length > 60 ? '…' : ''}</span>
        </div>
      )}
    </ComposerPrimitive.Root>
  );
};

export const ChatPanel = ({ baseId: propBaseId, className }: ChatPanelProps) => {
  const status = useChatPanelStore((state) => state.status);
  const baseId = propBaseId;
  const aiSessionId = useAiChatSessionStore((state) => state.get(baseId));
  const queryClient = useQueryClient();

  const selectionQuery = useQuery({
    queryKey: baseId ? ReactQueryKeys.gridSelection(baseId) : ['grid-selection', 'none'],
    queryFn: () =>
      baseId ? queryClient.getQueryData(ReactQueryKeys.gridSelection(baseId)) : undefined,
    enabled: Boolean(baseId),
    staleTime: Infinity,
  });
  const selectionContext = useMemo(
    () => (selectionQuery.data ? formatGridSelectionForChat(selectionQuery.data as never) : undefined),
    [selectionQuery.data]
  );

  const adapter = useMemo(
    () => buildCuppyAdapter({ baseId, selectionContext }),
    [baseId, selectionContext]
  );
  const runtime = useLocalRuntime(adapter as ChatModelAdapter, {
    adapters: {
      attachments: {
        accept: '*/*',
        async add({ file }) {
          return {
            id: `${file.name}-${file.lastModified}`,
            type: 'file' as const,
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            file,
            status: { type: 'requires-action' as const, reason: 'composer-send' as const },
          };
        },
        async remove() {
          return undefined;
        },
        async send(attachment) {
          const fileId = await adapter.uploadAttachment(attachment.file);
          return {
            ...attachment,
            id: fileId,
            content: [{ type: 'text' as const, text: fileId }],
            status: { type: 'complete' as const },
          };
        },
      },
    },
  });

  if (status === 'close') return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={`flex h-full flex-col ${className ?? ''}`}>
        <SelectionChips sessionId={aiSessionId} />
        <div
          data-testid="intelligence-toolbar"
          className="flex items-center gap-2 border-b bg-background/60 px-2 py-1.5"
        >
          <IntelligenceMenu sessionId={aiSessionId} />
          <ModelSelect sessionId={aiSessionId} />
        </div>
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <ThreadPrimitive.Empty>
            <div className="flex flex-col gap-2 py-6 text-sm text-muted-foreground">
              <p>
                {baseId
                  ? 'Ask anything about the active base.'
                  : 'Select a base to enable real LLM; general chat remains available.'}
              </p>
              <div className="flex flex-wrap gap-1">
                <ThreadPrimitive.Suggestion prompt="Summarize the active view" autoSend>
                  Summarize the active view
                </ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion prompt="Suggest a filter for this column">
                  Suggest a filter
                </ThreadPrimitive.Suggestion>
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadMessages />
        </ThreadPrimitive.Viewport>
        <CuppyComposer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
};

export default ChatPanel;
export { buildCuppyAdapter } from './Runtime';
