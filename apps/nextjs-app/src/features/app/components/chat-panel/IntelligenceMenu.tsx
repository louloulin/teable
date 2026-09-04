/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-2: Intelligence (smart-level) menu.
 *
 * Renders a 3-state segmented control bound to the session's
 * `effectiveSmartLevel` (low / medium / high).  When the user picks a
 * different level we PATCH /sessions/:id/intelligence — the server
 * upserts the per-session override and returns the effective config.
 *
 * Disabled when no sessionId is bound yet (user hasn't sent the first
 * turn so aiSessionId is unknown).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { aiChatApi, type IAiChatSmartLevel, type IIntelligenceSnapshot } from './api';

const LEVELS: ReadonlyArray<{
  value: IAiChatSmartLevel;
  label: string;
  hint: string;
}> = [
  { value: 'low', label: 'Low', hint: 'Concise' },
  { value: 'medium', label: 'Medium', hint: 'Balanced' },
  { value: 'high', label: 'High', hint: 'Deep' },
];

const INTELLIGENCE_KEY = (sessionId: string) =>
  ['ai-chat', 'intelligence', sessionId] as const;

export interface IIntelligenceMenuProps {
  sessionId: string | undefined;
  onChanged?: (snap: IIntelligenceSnapshot) => void;
}

export function IntelligenceMenu({ sessionId, onChanged }: IIntelligenceMenuProps) {
  const queryClient = useQueryClient();
  const queryKey = INTELLIGENCE_KEY(sessionId ?? '');

  const { data: snap, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(sessionId),
    queryFn: async () => (sessionId ? aiChatApi.getIntelligence(sessionId) : null),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: IAiChatSmartLevel) => {
      if (!sessionId) throw new Error('no session');
      return aiChatApi.patchIntelligence(sessionId, { smartLevel: next });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      onChanged?.(next);
      toast.success(`Smart level → ${next.effectiveSmartLevel}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!sessionId) return null;
  if (isLoading || !snap) {
    return (
      <div data-testid="intelligence-menu-loading" className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Intelligence…
      </div>
    );
  }

  return (
    <div
      data-testid="intelligence-menu"
      className="flex items-center gap-1 rounded-md border bg-background p-0.5 text-xs"
      title={`Token budget: ${snap.tokenBudget.toLocaleString()}`}
    >
      {LEVELS.map((opt) => {
        const isActive = snap.effectiveSmartLevel === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(opt.value)}
            data-testid={`intelligence-${opt.value}`}
            data-active={isActive ? 'true' : 'false'}
            className={`rounded px-2 py-1 transition ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={opt.hint}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
