import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import { useBase } from '@teable/sdk/hooks';
import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Maximize2, Minimize2, X } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { useChatPanelStore } from '../sidebar/useChatPanelStore';

// ──────────────────────────── Types ────────────────────────────

interface ICuppyMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  atIso?: string;
}

interface ICuppyConversation {
  conversationId: string;
  text: string;
}

interface IArtifactRow {
  id: string;
  name: string;
  kind: string;
  versions: number;
  createdAt: string;
  shared: boolean;
}

// ──────────────────────────── Helpers ────────────────────────────

const newConversationId = (): string =>
  `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const STORAGE_CONV_KEY = 'teable-cuppy-conversation';
const STORAGE_MESSAGES_KEY = 'teable-cuppy-messages';

// ──────────────────────────── Sub-views ────────────────────────────

function MessageBubble({ message }: { message: ICuppyMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.atIso && (
          <div className="mt-1 text-[10px] opacity-60">
            {new Date(message.atIso).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  onSend,
  isPending,
  disabled,
}: {
  onSend: (text: string) => void;
  isPending: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <div className="flex flex-col gap-2 p-3">
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={disabled ? 'Select a base first' : 'Ask Cuppy anything…'}
        maxLength={10_000}
        disabled={disabled || isPending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{text.length}/10000 · ⌘+↵</span>
        <Button
          size="sm"
          disabled={disabled || isPending || text.trim().length === 0}
          onClick={submit}
        >
          {isPending ? 'Thinking…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}

function MemoryPanel({
  conversationId,
  memory,
  onAdded,
}: {
  conversationId: string;
  memory: Record<string, { value: string; createdAt: string }>;
  onAdded: () => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const setMem = useMutation({
    mutationFn: () =>
      axios.put(`/api/cuppy/conversations/${conversationId}/memory`, {
        key: key.trim(),
        value,
      }),
    onSuccess: () => {
      setKey('');
      setValue('');
      onAdded();
      toast.success('Memory saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMem = useMutation({
    mutationFn: () => axios.delete(`/api/cuppy/conversations/${conversationId}/memory`),
    onSuccess: onAdded,
    onError: (e: Error) => toast.error(e.message),
  });

  const entries = Object.entries(memory);

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="text-xs font-medium text-muted-foreground">Memory (cross-database)</div>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground">No memory yet.</div>
      ) : (
        <ul className="space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-start justify-between gap-2 text-xs">
              <div>
                <div className="font-medium">{k}</div>
                <div className="text-muted-foreground">{v.value}</div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {new Date(v.createdAt).toLocaleDateString()}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-col gap-1">
        <Input
          placeholder="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          maxLength={128}
        />
        <Input
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={8000}
        />
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={entries.length === 0 || delMem.isPending}
            onClick={() => delMem.mutate()}
          >
            Clear all
          </Button>
          <Button
            size="sm"
            disabled={!key.trim() || !value || setMem.isPending}
            onClick={() => setMem.mutate()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArtifactsPanel({
  conversationId,
  artifacts,
  onChanged,
}: {
  conversationId: string;
  artifacts: IArtifactRow[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'chart' | 'report' | 'page' | 'card' | 'doc'>('chart');
  const [content, setContent] = useState('');

  const create = useMutation({
    mutationFn: () =>
      axios.post(`/api/cuppy/conversations/${conversationId}/artifacts`, {
        name: name.trim(),
        kind,
        content,
      }),
    onSuccess: () => {
      setName('');
      setContent('');
      onChanged();
      toast.success('Artifact created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      axios.delete(`/api/cuppy/conversations/${conversationId}/artifacts/${id}`),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="text-xs font-medium text-muted-foreground">Artifacts</div>
      {artifacts.length === 0 ? (
        <div className="text-xs text-muted-foreground">No artifacts yet.</div>
      ) : (
        <ul className="space-y-1">
          {artifacts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-muted-foreground">
                  {a.kind} · v{a.versions}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove.mutate(a.id)}
                disabled={remove.isPending}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-col gap-1">
        <Input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chart">chart</SelectItem>
            <SelectItem value="report">report</SelectItem>
            <SelectItem value="page">page</SelectItem>
            <SelectItem value="card">card</SelectItem>
            <SelectItem value="doc">doc</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          rows={2}
          placeholder="content (markdown / json)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={64000}
        />
        <Button
          size="sm"
          disabled={!name.trim() || !content || create.isPending}
          onClick={() => create.mutate()}
        >
          Add artifact
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────── Main panel ────────────────────────────

export function ChatPanel() {
  const router = useRouter();
  const base = useBase();
  const baseId = String(router.query.baseId ?? base?.id ?? '');
  const { status, close, toggleExpanded } = useChatPanelStore();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ICuppyMessage[]>([]);
  const [smartLevel, setSmartLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [model, setModel] = useState<string>('default');
  const [tab, setTab] = useState<'memory' | 'artifacts'>('memory');

  // Restore last conversation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const conv = window.localStorage.getItem(STORAGE_CONV_KEY);
    const msgs = window.localStorage.getItem(STORAGE_MESSAGES_KEY);
    setConversationId(conv || newConversationId());
    if (msgs) {
      try {
        setMessages(JSON.parse(msgs));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (conversationId) window.localStorage.setItem(STORAGE_CONV_KEY, conversationId);
    window.localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
  }, [conversationId, messages]);

  // Conversation state queries
  const memoryQuery = useQuery({
    queryKey: ['cuppy', 'memory', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () =>
      axios
        .get<{ memory: Record<string, { value: string; createdAt: string }> }>(
          `/api/cuppy/conversations/${conversationId}/memory`
        )
        .then((r) => r.data.memory ?? {}),
  });

  const artifactsQuery = useQuery({
    queryKey: ['cuppy', 'artifacts', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () =>
      axios
        .get<{ artifacts: IArtifactRow[] }>(
          `/api/cuppy/conversations/${conversationId}/artifacts`
        )
        .then((r) => r.data.artifacts ?? []),
  });

  const smartLevelQuery = useQuery({
    queryKey: ['cuppy', 'smart-level', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () =>
      axios
        .get<{ level: 'low' | 'medium' | 'high' }>(
          `/api/cuppy/conversations/${conversationId}/smart-level`
        )
        .then((r) => r.data.level),
  });

  const modelQuery = useQuery({
    queryKey: ['cuppy', 'model', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () =>
      axios
        .get<{ model: string }>(`/api/cuppy/conversations/${conversationId}/model`)
        .then((r) => r.data.model ?? 'default'),
  });

  useEffect(() => {
    if (smartLevelQuery.data) setSmartLevel(smartLevelQuery.data);
  }, [smartLevelQuery.data]);
  useEffect(() => {
    if (modelQuery.data) setModel(modelQuery.data);
  }, [modelQuery.data]);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['cuppy', 'memory', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['cuppy', 'artifacts', conversationId] });
  }, [queryClient, conversationId]);

  const send = useMutation({
    mutationFn: (text: string) =>
      axios.post<ICuppyConversation>('/api/cuppy/chat', {
        baseId: baseId || undefined,
        conversationId,
        message: text,
      }),
    onMutate: (text) => {
      setMessages((m) => [
        ...m,
        { role: 'user', content: text, atIso: new Date().toISOString() },
      ]);
    },
    onSuccess: (res) => {
      const text = res.data.text ?? '';
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: text, atIso: new Date().toISOString() },
      ]);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setMessages((m) => m.slice(0, -1));
    },
  });

  const updateSmartLevel = useMutation({
    mutationFn: (level: 'low' | 'medium' | 'high') =>
      axios.post(`/api/cuppy/conversations/${conversationId}/smart-level`, { level }),
  });
  const updateModel = useMutation({
    mutationFn: (m: string) =>
      axios.post(`/api/cuppy/conversations/${conversationId}/model`, { model: m }),
  });

  if (status === 'close') return null;

  const isExpanded = status === 'expanded';
  const widthClass = isExpanded ? 'w-[min(800px,80vw)]' : 'w-[360px]';

  return (
    <TooltipProvider delayDuration={150}>
      <Head>
        <title>Cuppy</title>
      </Head>
      <aside
        data-testid="cuppy-chat-panel"
        className={`flex h-full flex-col border-l bg-background ${widthClass}`}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Cuppy</span>
            <Badge variant="outline" className="text-[10px]">
              {smartLevel}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {model}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={toggleExpanded}>
                  {isExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isExpanded ? 'Collapse' : 'Expand'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={close}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
          <Select
            value={smartLevel}
            onValueChange={(v) => {
              const next = v as 'low' | 'medium' | 'high';
              setSmartLevel(next);
              updateSmartLevel.mutate(next);
            }}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-7 w-32 text-xs"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => model.trim() && updateModel.mutate(model.trim())}
            placeholder="model"
          />
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant={tab === 'memory' ? 'secondary' : 'ghost'}
              onClick={() => setTab('memory')}
            >
              Memory
            </Button>
            <Button
              size="sm"
              variant={tab === 'artifacts' ? 'secondary' : 'ghost'}
              onClick={() => setTab('artifacts')}
            >
              Artifacts
            </Button>
          </div>
        </div>

        <div className="border-b">
          {tab === 'memory' ? (
            <MemoryPanel
              conversationId={conversationId}
              memory={memoryQuery.data ?? {}}
              onAdded={invalidateAll}
            />
          ) : (
            <ArtifactsPanel
              conversationId={conversationId}
              artifacts={artifactsQuery.data ?? []}
              onChanged={invalidateAll}
            />
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-3">
            {messages.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Start the conversation — Cuppy has access to your base schema.
              </div>
            ) : (
              messages.map((m, i) => <MessageBubble key={i} message={m} />)
            )}
            {send.isPending && <Skeleton className="h-8 w-32 self-start" />}
          </div>
        </ScrollArea>

        <Composer
          disabled={!conversationId || !baseId}
          isPending={send.isPending}
          onSend={(t) => send.mutate(t)}
        />
      </aside>
    </TooltipProvider>
  );
}
