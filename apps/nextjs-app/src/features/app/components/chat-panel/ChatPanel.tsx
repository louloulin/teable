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
import { Send, Trash2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cuppyApi, type ICuppyMessage, type ICuppyModel } from './api';

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

export const ChatPanel = ({ baseId: propBaseId, className }: ChatPanelProps) => {
  const ctxBaseId: string | undefined = undefined;
  const baseId = propBaseId ?? ctxBaseId ?? undefined;
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('');
  const [messages, setMessages] = useState<IDisplayMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
        messagesQuery.data.map((m: ICuppyMessage) => ({
          id: m.id,
          role: m.role,
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    chatMutation.mutate(text);
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
          {chatMutation.isPending && (
            <ChatBubble
              message={{
                id: 'pending',
                role: 'assistant',
                content: '…thinking',
              }}
              pending
            />
          )}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t px-3 py-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={baseId ? 'Ask Cuppy…' : 'Type anything (echo fallback)…'}
          disabled={chatMutation.isPending}
          maxLength={10_000}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={chatMutation.isPending || !input.trim()}
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
