/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-1: SelectionChips rendering + remove + clear-by-table.
 *
 * Mocks aiChatApi so we can assert the UI delegates correctly without
 * hitting the network. 6 cases covering: empty list, render 3 chips,
 * × click → removeSelectionRef, Clear all → clearSelectionByTable per
 * table, render nothing when sessionId is undefined, tableId filter.
 */
vi.mock('@teable/ui-lib/shadcn/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
  Toaster: () => null,
}));

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SelectionChips } from './SelectionChips';

vi.mock('./api', () => ({
  aiChatApi: {
    listSelectionRefs: vi.fn(),
    removeSelectionRef: vi.fn(),
    clearSelectionByTable: vi.fn(),
  },
}));

// aiChatApi accessed via global module mock above

const { aiChatApi } = await import('./api');

const SESSION_ID = 'sess_1';
const TABLE_A = 'tblA';
const TABLE_B = 'tblB';

const sample = [
  {
    id: 'r1',
    sessionId: SESSION_ID,
    tableId: TABLE_A,
    viewId: null,
    selectionType: 'row' as const,
    refKey: 'a',
    refValue: {},
    displayLabel: 'Order #1',
    rowCount: null,
    createdBy: 'u1',
    createdTime: new Date('2026-09-05').toISOString(),
  },
  {
    id: 'r2',
    sessionId: SESSION_ID,
    tableId: TABLE_A,
    viewId: null,
    selectionType: 'column' as const,
    refKey: 'b',
    refValue: {},
    displayLabel: 'Status',
    rowCount: 42,
    createdBy: 'u1',
    createdTime: new Date('2026-09-05').toISOString(),
  },
  {
    id: 'r3',
    sessionId: SESSION_ID,
    tableId: TABLE_B,
    viewId: null,
    selectionType: 'range' as const,
    refKey: 'c',
    refValue: {},
    displayLabel: 'Rows 1-5',
    rowCount: 5,
    createdBy: 'u1',
    createdTime: new Date('2026-09-05').toISOString(),
  },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('SelectionChips (R-CHAT-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders nothing when sessionId is undefined', () => {
    const { container } = render(<SelectionChips sessionId={undefined} />, {
      wrapper: makeWrapper(),
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when list is empty', async () => {
    ((await import('./api')).aiChatApi.listSelectionRefs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { container } = render(<SelectionChips sessionId={SESSION_ID} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(aiChatApi.listSelectionRefs).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="ai-chat-selection-chips"]')).toBeNull();
  });

  it('renders one chip per ref with type-specific badge', async () => {
    ((await import('./api')).aiChatApi.listSelectionRefs as ReturnType<typeof vi.fn>).mockResolvedValue(sample);
    render(<SelectionChips sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getAllByText(/^\d+ attached$/)[0]).toBeTruthy());
    expect(screen.getAllByTestId(/^selection-chip-/)).toHaveLength(3);
    expect(screen.getAllByText('Order #1')[0]).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getAllByText('Rows 1-5')[0]).toBeTruthy();
  });

  it('× click calls removeSelectionRef with the correct refId', async () => {
    ((await import('./api')).aiChatApi.listSelectionRefs as ReturnType<typeof vi.fn>).mockResolvedValue(sample);
    ((await import('./api')).aiChatApi.removeSelectionRef as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: true });
    render(<SelectionChips sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getAllByText(/^\d+ attached$/)[0]);
    const buttons = screen.getAllByRole('button', { name: /^Remove / });
    fireEvent.click(buttons[0]); // first chip ×
    await waitFor(() =>
      expect(aiChatApi.removeSelectionRef).toHaveBeenCalledWith(SESSION_ID, 'r1')
    );
  });

  it('Clear all calls clearSelectionByTable per distinct tableId', async () => {
    ((await import('./api')).aiChatApi.listSelectionRefs as ReturnType<typeof vi.fn>).mockResolvedValue(sample);
    ((await import('./api')).aiChatApi.clearSelectionByTable as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: 1 });
    render(<SelectionChips sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getAllByText(/^\d+ attached$/)[0]);
    const clearBtn = screen.getByRole('button', { name: 'Clear all' });
    fireEvent.click(clearBtn);
    await waitFor(async () => {
      const calls = ((await import('./api')).aiChatApi.clearSelectionByTable as ReturnType<typeof vi.fn>).mock.calls;
      const tableArgs = calls.map((c) => c[1]).sort();
      expect(tableArgs).toEqual([TABLE_A, TABLE_B].sort());
    });
  });

  it('tableId filter restricts chips to one table', async () => {
    ((await import('./api')).aiChatApi.listSelectionRefs as ReturnType<typeof vi.fn>).mockResolvedValue(sample);
    render(<SelectionChips sessionId={SESSION_ID} tableId={TABLE_A} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => screen.getAllByText(/^\d+ attached$/)[0]);
    expect(screen.queryAllByText('Rows 1-5')).toHaveLength(0);
    expect(screen.getAllByText('Order #1')[0]).toBeTruthy();
  });
});
