import type { QueryClient } from '@tanstack/react-query';
import type { CombinedSelection } from '@teable/sdk';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useChatPanelStore } from '@/features/app/components/sidebar/useChatPanelStore';
import { aiChatApi, type IAiChatSelectionType } from '@/features/app/components/chat-panel/api';
import { useAiChatSessionStore } from '@/features/app/components/chat-panel/useAiChatSessionStore';

export enum GridSelectionType {
  Rows = 'rows',
  Cols = 'cols',
  Cells = 'cells',
}

export interface IGridSelectionCacheColumns {
  columnStart: number;
  columnEnd: number;
  names?: string[];
}

export interface IGridSelectionCacheData {
  rows?: [number, number][];
  columns?: IGridSelectionCacheColumns;
  timestamp: number;
  addToChat?: boolean;
}

export function formatGridSelectionForChat(data?: IGridSelectionCacheData): string | undefined {
  if (!data) return undefined;

  const parts: string[] = [];
  if (data.rows?.length) {
    parts.push(
      `行 ${data.rows.map(([start, end]) => (start === end ? `${start + 1}` : `${start + 1}-${end + 1}`)).join(', ')}`
    );
  }
  if (data.columns) {
    const range =
      data.columns.columnStart === data.columns.columnEnd
        ? `${data.columns.columnStart + 1}`
        : `${data.columns.columnStart + 1}-${data.columns.columnEnd + 1}`;
    const names = data.columns.names?.filter(Boolean).slice(0, 20);
    parts.push(`列 ${names?.length ? `${names.join(', ')} (${range})` : range}`);
  }

  return parts.length ? `当前用户选中的网格范围：${parts.join('，')}。请优先基于此范围回答。` : undefined;
}

function setGridSelectionCache(
  queryClient: QueryClient,
  baseId: string,
  data: Omit<IGridSelectionCacheData, 'timestamp'> & {
    tableId?: string;
    viewId?: string | null;
    syncToBackend?: boolean;
  }
) {
  const { tableId, viewId, syncToBackend, ...rest } = data;
  queryClient.setQueryData(ReactQueryKeys.gridSelection(baseId), {
    ...rest,
    timestamp: Date.now(),
  });
  if (data.addToChat) {
    useChatPanelStore.getState().open();
  }
  if (syncToBackend && tableId) {
    void syncSelectionToBackend(baseId, tableId, viewId ?? null, rest);
  }
}

async function syncSelectionToBackend(
  baseId: string,
  tableId: string,
  viewId: string | null,
  data: Omit<IGridSelectionCacheData, 'timestamp' | 'addToChat'>
): Promise<void> {
  const sessionId = useAiChatSessionStore.getState().get(baseId);
  if (!sessionId) return; // No active ai session yet — chips will re-sync once session exists.

  const rows = data.rows;
  const cols = data.columns;

  try {
    if (rows && cols) {
      await aiChatApi.addSelectionRef(sessionId, {
        tableId,
        viewId,
        selectionType: 'range',
        refKey: `${tableId}:range:${rows.map(([s, e]) => `${s}-${e}`).join('_')}:c${cols.columnStart}-${cols.columnEnd}`,
        refValue: { rows, columns: cols },
        displayLabel: `Rows ${rows.map(([s, e]) => (s === e ? s + 1 : `${s + 1}-${e + 1}`)).join(', ')} × Cols ${cols.columnStart + 1}-${cols.columnEnd + 1}`,
        rowCount: rows.reduce((sum, [s, e]) => sum + (e - s + 1), 0),
      });
    } else if (rows && rows.length) {
      for (const [s, e] of rows) {
        await aiChatApi.addSelectionRef(sessionId, {
          tableId,
          viewId,
          selectionType: 'row',
          refKey: `${tableId}:row:${s}-${e}`,
          refValue: { rowStart: s, rowEnd: e },
          displayLabel: s === e ? `Row ${s + 1}` : `Rows ${s + 1}-${e + 1}`,
          rowCount: e - s + 1,
        });
      }
    } else if (cols) {
      await aiChatApi.addSelectionRef(sessionId, {
        tableId,
        viewId,
        selectionType: 'column',
        refKey: `${tableId}:column:${cols.columnStart}-${cols.columnEnd}`,
        refValue: { columnStart: cols.columnStart, columnEnd: cols.columnEnd, names: cols.names },
        displayLabel: cols.names?.length
          ? `Cols ${cols.names.join(', ')}`
          : `Cols ${cols.columnStart + 1}-${cols.columnEnd + 1}`,
        rowCount: 0,
      });
    }
  } catch {
    // best-effort sync — chips will recover on next user interaction
  }
}

function getRowRanges(selection: CombinedSelection): [number, number][] | null {
  const { isCellSelection, isRowSelection } = selection;
  if (isCellSelection) {
    const [[, startRow], [, endRow]] = selection.serialize();
    return [[Math.min(startRow, endRow), Math.max(startRow, endRow)]];
  }
  if (isRowSelection) {
    return selection
      .serialize()
      .map(([s, e]) => [Math.min(s, e), Math.max(s, e)] as [number, number]);
  }
  return null;
}

function getColRange(
  selection: CombinedSelection
): { columnStart: number; columnEnd: number } | null {
  if (selection.isCellSelection) {
    const [[c0], [c1]] = selection.serialize();
    return { columnStart: Math.min(c0, c1), columnEnd: Math.max(c0, c1) };
  }
  if (selection.isColumnSelection) {
    const [start, end] = selection.serialize()[0];
    return { columnStart: Math.min(start, end), columnEnd: Math.max(start, end) };
  }
  return null;
}

export function cacheSelectionForChat(
  queryClient: QueryClient,
  baseId: string,
  selection: CombinedSelection,
  addToChat: boolean,
  tableContext?: { tableId: string; viewId?: string | null }
) {
  const rows = getRowRanges(selection);
  const cols = getColRange(selection);
  const sync = Boolean(addToChat && tableContext?.tableId);

  if (selection.isColumnSelection && cols) {
    setGridSelectionCache(queryClient, baseId, {
      columns: cols,
      addToChat,
      ...(tableContext ?? {}),
      syncToBackend: sync,
    });
  } else if (selection.isCellSelection && rows && cols) {
    setGridSelectionCache(queryClient, baseId, {
      rows,
      columns: cols,
      addToChat,
      ...(tableContext ?? {}),
      syncToBackend: sync,
    });
  } else if (rows) {
    setGridSelectionCache(queryClient, baseId, {
      rows,
      addToChat,
      ...(tableContext ?? {}),
      syncToBackend: sync,
    });
  }
}

export function cacheColumnSelectionForChat(
  queryClient: QueryClient,
  baseId: string,
  columnStart: number,
  columnEnd: number,
  names?: string[],
  tableContext?: { tableId: string; viewId?: string | null }
) {
  setGridSelectionCache(queryClient, baseId, {
    columns: { columnStart, columnEnd, names },
    addToChat: true,
    ...(tableContext ?? {}),
    syncToBackend: Boolean(tableContext?.tableId),
  });
}

export function isSingleCellSelection(selection: CombinedSelection): boolean {
  if (!selection.isCellSelection) return false;
  const [[c0, r0], [c1, r1]] = selection.serialize();
  return c0 === c1 && r0 === r1;
}
