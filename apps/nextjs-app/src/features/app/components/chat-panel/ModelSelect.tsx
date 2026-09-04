/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-2: Model picker dropdown.
 *
 * Renders a `<select>` bound to the session's `effectiveModel`.  When
 * the user picks a different model we PATCH /sessions/:id/intelligence
 * with `{ model }`.  The default list is a small static set; if the
 * global AiSetting exposes additional models we'd fetch them via
 * /api/admin/ai-setting (TODO post-Phase-1).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { aiChatApi, type IIntelligenceSnapshot } from './api';

const DEFAULT_MODELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
];

const INTELLIGENCE_KEY = (sessionId: string) =>
  ['ai-chat', 'intelligence', sessionId] as const;

export interface IModelSelectProps {
  sessionId: string | undefined;
  /** Optional override list (e.g. from /api/admin/custom-ai-model). */
  options?: ReadonlyArray<{ value: string; label: string }>;
  onChanged?: (snap: IIntelligenceSnapshot) => void;
}

export function ModelSelect({ sessionId, options, onChanged }: IModelSelectProps) {
  const queryClient = useQueryClient();
  const queryKey = INTELLIGENCE_KEY(sessionId ?? '');
  const items = options ?? DEFAULT_MODELS;

  const { data: snap } = useQuery({
    queryKey,
    enabled: Boolean(sessionId),
    queryFn: async () => (sessionId ? aiChatApi.getIntelligence(sessionId) : null),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (model: string) => {
      if (!sessionId) throw new Error('no session');
      return aiChatApi.patchIntelligence(sessionId, { model });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      onChanged?.(next);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!sessionId) return null;

  const current = snap?.effectiveModel ?? '';

  return (
    <div data-testid="model-select" className="relative inline-flex items-center">
      <select
        aria-label="AI model"
        value={current}
        disabled={mutation.isPending}
        onChange={(e) => mutation.mutate(e.target.value)}
        data-testid="model-select-input"
        className="appearance-none rounded-md border bg-background px-2 py-1 pr-7 text-xs outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="" disabled>
          Pick a model…
        </option>
        {items.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted-foreground" />
    </div>
  );
}
