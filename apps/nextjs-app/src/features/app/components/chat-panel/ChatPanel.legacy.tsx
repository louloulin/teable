/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-8 — Cuppy AI 对话面板
 *
 * 默认 general chat (panelType='general')：调用 `/api/cuppy/chat` 显示 AI 回复。
 * 当用户选中 base 时附带 baseId 触发真实 LLM 路径（前提：admin 已配置
 * gateway apiKey 或空间 BYOK）。
 *
 * 设计目标：
 *   1. 最低代码量即可工作（~250 行）
 *   2. 不假设有真实 LLM — echo fallback 也能正常显示
 *   3. 与 useChatPanelStore 集成（open/close/expanded）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Paperclip, Send, Trash2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ReactQueryKeys } from '@teable/sdk/config';

import { cuppyApi, type ICuppyMessage, type ICuppyModel, type ICuppyFileRef } from './api';
import {
  formatGridSelectionForChat,
  type IGridSelectionCacheData,
} from '../../blocks/view/grid/utils/gridSelectionChat';

interface IDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fallback?: 'no-base' | 'no-provider' | 'timeout' | 'error';
}

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detectFallback(text: string): IDisplayMessage['fallback'] {
  if (text.includes('[real-LLM provider fallback:') && text.includes('timeout')) {
    return 'timeout';
  }
  if (text.includes('[real-LLM provider fallback:')) {
    return 'no-provider';
  }
  if (text.includes('built-in fallback')) {
    return 'no-base';
  }
  return undefined;
}

export interface ChatPanelProps {
  /** Override the current base id (optional; default reads from context). */
  baseId?: string;
  /** Optional CSS class for outer container. */
  className?: string;
}

export const ChatPanelLegacy = ({ baseId: propBaseId, className }: ChatPanelProps) => {
  const ctxBaseId: string | undefined = undefined;
  const baseId = propBaseId ?? ctxBaseId ?? undefined;
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('');
  const [messages, setMessages] = useState<IDisplayMessage[]>([]);
  const selectionQuery = useQuery({
    queryKey: baseId ? ReactQueryKeys.gridSelection(baseId) : ['grid-selection', 'none'],
    queryFn: () =>
      baseId ? queryClient.getQueryData<IGridSelectionCacheData>(ReactQueryKeys.gridSelection(baseId)) : undefined,
    enabled: Boolean(baseId),
    staleTime: Infinity,
  });
  const selectionContext = formatGridSelectionForChat(selectionQuery.data);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // R-AI-14: chat usage summary (lifetime totals). Mirrors the
  // /api/chat/usage/summary endpoint shape; declared locally to avoid
  // pulling the entire usage service interface into the chat panel.
  interface IUsageSummary {
    totalSessions: number;
    totalMessages: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    modelCounts: Array<{ model: string; count: number }>;
  }
  const usageQuery = useQuery<IUsageSummary>({
    queryKey: ['ai-chat', 'usage', 'summary'],
    queryFn: async () => {
      const r = await axios.get<IUsageSummary>('/api/chat/usage/summary');
      return r.data;
    },
    enabled: true,
    staleTime: 30_000,
  });
  const totalTokens =
    (usageQuery.data?.totalPromptTokens ?? 0) +
    (usageQuery.data?.totalCompletionTokens ?? 0);

  // R-AI-13: per-conversation uploaded file refs (attachments panel).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<ICuppyFileRef[]>([]);
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!conversationId) {
        throw new Error('等对话开始后再上传附件');
      }
      return cuppyApi.uploadFile(conversationId, file);
    },
    onSuccess: (ref) => {
      setAttachedFiles((prev) => [...prev, ref]);
      queryClient.invalidateQueries({ queryKey: ['cuppy', 'files', conversationId] });
      toast.success(`已附加 ${ref.name}`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      toast.error(`附件上传失败: ${msg}`);
    },
  });
  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('附件超过 25MB 上限');
      return;
    }
    uploadMutation.mutate(file);
  };

  // Load available models on mount
  const modelsQuery = useQuery({
    queryKey: ['cuppy', 'models'],
    queryFn: () => cuppyApi.listModels(),
    staleTime: 5 * 60_000,
  });

  // Default model selection
  useEffect(() => {
    if (!model && modelsQuery.data && modelsQuery.data.length > 0) {
      const lite = modelsQuery.data.find((m) => m.tier === 'lite');
      setModel(lite?.id ?? modelsQuery.data[0].id);
    }
  }, [modelsQuery.data, model]);

  // Load messages when conversation changes
  const messagesQuery = useQuery({
    queryKey: ['cuppy', 'messages', conversationId],
    queryFn: () => cuppyApi.listMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(
        messagesQuery.data
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            fallback: m.role === 'assistant' ? detectFallback(m.content) : undefined,
          }))
      );
    }
  }, [messagesQuery.data]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const assistantIdRef = useRef<string | null>(null);

  const chatMutation = useMutation({
    mutationFn: (text: string) =>
      cuppyApi.chat({
        baseId,
        conversationId,
        message: text,
      }),
    onMutate: (text) => {
      const optimistic: IDisplayMessage = {
        id: genId(),
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput('');
    },
    onSuccess: (reply) => {
      setConversationId(reply.conversationId);
      const fallback = reply.fallback ?? detectFallback(reply.text);
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: 'assistant',
          content: reply.text,
          fallback,
        },
      ]);
      if (reply.model) {
        queryClient.setQueryData(['cuppy', 'lastModel'], reply.model);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      toast.error(`Cuppy chat failed: ${msg}`);
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: 'assistant',
          content: `⚠️ ${msg}`,
          fallback: 'error',
        },
      ]);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) return { ok: true };
      return cuppyApi.deleteConversation(conversationId);
    },
    onSuccess: () => {
      setConversationId(undefined);
      setMessages([]);
      queryClient.removeQueries({ queryKey: ['cuppy', 'messages'] });
    },
  });

  /**
   * R-AI-11: Stream the reply through SSE so each token lands in the UI as
   * soon as it arrives from the provider. Adds the user message immediately,
   * then opens an assistant placeholder that grows with each delta.
   */
  const submitStream = async (text: string): Promise<void> => {
    const userMsg: IDisplayMessage = {
      id: genId(),
      role: 'user',
      content: text,
    };
    const assistantId = genId();
    assistantIdRef.current = assistantId;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setIsStreaming(true);
    try {
      for await (const chunk of cuppyApi.chatStream({
        baseId,
        conversationId,
        message: text,
        context: selectionContext,
      })) {
        if (assistantIdRef.current !== assistantId) break;
        if (chunk.conversationId) {
          setConversationId((prev) => prev ?? chunk.conversationId);
        }
        if (chunk.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ ${chunk.error}`, fallback: 'error' as const }
                : m
            )
          );
          continue;
        }
        if (chunk.done) {
          const final = chunk.value ?? '';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: final, fallback: detectFallback(final) }
                : m
            )
          );
          break;
        }
        if (chunk.delta) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk.delta } : m
            )
          );
        }
      }
    } finally {
      if (assistantIdRef.current === assistantId) {
        assistantIdRef.current = null;
      }
      setIsStreaming(false);
      // R-AI-12: drain the next queued message (if any). Local queue
      // mirrors the server-side `/api/chat/sessions/:sessionId/queue`
      // endpoint and survives across rapid back-to-back turns.
      setQueuedMessages((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        queueMicrotask(() => { void submitStream(next); });
        return rest;
      });
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (isStreaming || chatMutation.isPending) {
      // R-AI-12: queue the message locally instead of dropping it. The
      // submitStream finally block drains this queue automatically once
      // the current turn completes.
      setQueuedMessages((prev) => [...prev, text]);
      setInput('');
      return;
    }
    submitStream(text).catch((err) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      toast.error(`Cuppy stream failed: ${msg}`);
      // Fallback to the non-streaming chat if the stream fails to even
      // start (network error, unsupported browser, etc.).
      chatMutation.mutate(text);
    });
  };

  const models = (modelsQuery.data ?? []) as ICuppyModel[];

  return (
    <div className={`flex h-full flex-col bg-background ${className ?? ''}`}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Cuppy</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {baseId ? 'base' : 'no-base'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {usageQuery.data && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              title={`${usageQuery.data.totalSessions} 会话 · ${usageQuery.data.totalMessages} 消息`}
              data-testid="chat-usage-pill"
            >
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          {models.length > 0 && (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={clearMutation.isPending || messages.length === 0}
            onClick={() => clearMutation.mutate()}
            aria-label="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Sparkles className="mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">
              {baseId
                ? 'Ask Cuppy anything about this base.'
                : 'Open a base to unlock table-aware answers.'}
            </p>
            {!baseId && (
              <p className="mt-1 text-xs">
                Without a base, replies come from the built-in echo fallback.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {(isStreaming || chatMutation.isPending) && (
            <ChatBubble
              message={{
                id: 'pending',
                role: 'assistant',
                content: '…thinking',
              }}
              pending={!isStreaming}
            />
          )}
        </div>
      </div>

      {(isStreaming || chatMutation.isPending) && queuedMessages.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-dashed px-3 py-1 text-xs text-muted-foreground">
          <span>队列中还有 {queuedMessages.length} 条消息，将在当前回合结束后逐条发送</span>
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setQueuedMessages([])}
          >
            清空队列
          </button>
        </div>
      )}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-dashed px-3 py-1 text-[11px] text-muted-foreground">
          {attachedFiles.map((f) => (
            <span
              key={f.fileId}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5"
              title={`${f.mime} · ${Math.ceil(f.size / 1024)} KB`}
            >
              <Paperclip className="h-3 w-3" />
              {f.name}
              <button
                type="button"
                aria-label="移除附件"
                onClick={() => setAttachedFiles((prev) => prev.filter((x) => x.fileId !== f.fileId))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t px-3 py-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onPickFile}
          aria-hidden="true"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={uploadMutation.isPending}
          aria-label="附加文件"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={baseId ? 'Ask Cuppy…' : 'Type anything (echo fallback)…'}
          disabled={false}
          maxLength={10_000}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim()}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

interface IChatBubbleProps {
  message: IDisplayMessage;
  pending?: boolean;
}

const ChatBubble = ({ message, pending }: IChatBubbleProps) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        } ${pending ? 'animate-pulse' : ''}`}
      >
        {message.content}
        {message.fallback && !pending && (
          <div className="mt-2 border-t border-current/20 pt-1 text-[10px] opacity-70">
            {message.fallback === 'no-base' &&
              'Echo fallback · select a base for real LLM answers.'}
            {message.fallback === 'no-provider' &&
              'Echo fallback · configure admin AI gateway or BYOK.'}
            {message.fallback === 'timeout' &&
              'Echo fallback · upstream LLM timed out (8s).'}
            {message.fallback === 'error' && 'Echo fallback · upstream error.'}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatPanel = ChatPanelLegacy;
