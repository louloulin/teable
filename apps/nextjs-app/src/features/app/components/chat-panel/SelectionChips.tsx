/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-1: AI Chat selection chips UI.
 *
 * Renders one chip per persisted selection ref (row / column / cell /
 * range) for the active chat session. Each chip shows:
 *   - selectionType badge (with a coloured dot)
 *   - displayLabel (e.g. "Order #1", "Status [42 rows]")
 *   - row count when applicable
 *   - × button to remove
 *
 * The "Clear all" button removes every ref belonging to the session.
 * `addSelectionRef` is exposed for callers (e.g. gridSelectionChat) that
 * want to push a new ref into the session programmatically — the
 * `useSelectionChipsSync` hook wires the grid cache to that.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, Columns, Grid2x2, RectangleHorizontal, X } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { aiChatApi, type IAiChatSelectionRef, type IAiChatSelectionType } from './api';

const TYPE_ICON: Record<IAiChatSelectionType, React.ComponentType<{ className?: string }>> = {
  row: RectangleHorizontal,
  column: Columns,
  cell: CircleDot,
  range: Grid2x2,
};

const TYPE_LABEL: Record<IAiChatSelectionType, string> = {
  row: 'Row',
  column: 'Column',
  cell: 'Cell',
  range: 'Range',
};

const TYPE_COLOR: Record<IAiChatSelectionType, string> = {
  row: 'bg-blue-100 text-blue-700 border-blue-200',
  column: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cell: 'bg-amber-100 text-amber-700 border-amber-200',
  range: 'bg-purple-100 text-purple-700 border-purple-200',
};

const SELECTION_REFS_KEY = (sessionId: string) => ['ai-chat', 'selection', sessionId] as const;

export interface ISelectionChipsProps {
  sessionId: string | undefined;
  /** Optional table to filter by (used when chipping one table's selections). */
  tableId?: string;
  onChanged?: () => void;
  className?: string;
}

export function SelectionChips({ sessionId, tableId, onChanged, className }: ISelectionChipsProps) {
  const queryClient = useQueryClient();
  const queryKey = SELECTION_REFS_KEY(sessionId ?? '');

  const { data: refs = [], isLoading } = useQuery({
    queryKey,
    enabled: Boolean(sessionId),
    queryFn: async () => (sessionId ? aiChatApi.listSelectionRefs(sessionId) : []),
    staleTime: 30_000,
  });

  const filtered = useMemo(
    () => (tableId ? refs.filter((r) => r.tableId === tableId) : refs),
    [refs, tableId]
  );

  const remove = async (refId: string) => {
    if (!sessionId) return;
    try {
      await aiChatApi.removeSelectionRef(sessionId, refId);
      await queryClient.invalidateQueries({ queryKey });
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const clearAll = async () => {
    if (!sessionId) return;
    const tables = Array.from(new Set(filtered.map((r) => r.tableId)));
    try {
      for (const t of tables) {
        await aiChatApi.clearSelectionByTable(sessionId, t);
      }
      await queryClient.invalidateQueries({ queryKey });
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!sessionId) return null;
  if (isLoading) return null;
  if (filtered.length === 0) return null;

  return (
    <div
      data-testid="ai-chat-selection-chips"
      className={`flex flex-wrap items-center gap-1.5 border-b bg-muted/40 p-2 ${className ?? ''}`}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {filtered.length} attached
      </span>
      {filtered.map((ref) => (
        <SelectionChip key={ref.id} ref_={ref} onRemove={() => remove(ref.id)} />
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-auto rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Clear all
      </button>
    </div>
  );
}

interface ISelectionChipProps {
  ref_: IAiChatSelectionRef;
  onRemove: () => void;
}

function SelectionChip({ ref_, onRemove }: ISelectionChipProps) {
  const Icon = TYPE_ICON[ref_.selectionType];
  const color = TYPE_COLOR[ref_.selectionType];
  return (
    <span
      data-testid={`selection-chip-${ref_.selectionType}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${color}`}
      title={`${TYPE_LABEL[ref_.selectionType]}: ${ref_.displayLabel}`}
    >
      <Icon className="h-3 w-3" />
      <span className="max-w-[12rem] truncate">{ref_.displayLabel}</span>
      {ref_.rowCount != null && (
        <span className="ml-1 rounded bg-white/50 px-1 text-[10px]">{ref_.rowCount} rows</span>
      )}
      <button
        type="button"
        aria-label={`Remove ${TYPE_LABEL[ref_.selectionType]} chip`}
        onClick={onRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-black/10"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export const selectionRefsQueryKey = SELECTION_REFS_KEY;
