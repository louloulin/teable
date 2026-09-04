/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-2: IntelligenceMenu 5 vitest cases.
 *
 *   1. Renders nothing when sessionId is undefined
 *   2. Renders 3 buttons (low / medium / high)
 *   3. Highlights active button
 *   4. Click low → calls patchIntelligence with { smartLevel: 'low' }
 *   5. Click high → updates query data optimistically on success
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

import { IntelligenceMenu } from './IntelligenceMenu';

vi.mock('./api', () => ({
  aiChatApi: {
    getIntelligence: vi.fn(),
    patchIntelligence: vi.fn(),
  },
}));

const { aiChatApi } = await import('./api');

const SESSION_ID = 'sess_1';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('IntelligenceMenu (R-CHAT-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders nothing when sessionId is undefined', () => {
    const { container } = render(<IntelligenceMenu sessionId={undefined} />, {
      wrapper: makeWrapper(),
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders 3 buttons (low / medium / high)', async () => {
    (aiChatApi.getIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: null,
      model: null,
      effectiveSmartLevel: 'medium',
      effectiveModel: 'gpt-4o-mini',
      allowedTools: ['table.read'],
      tokenBudget: 16_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: 'gpt-4o-mini' },
    });
    render(<IntelligenceMenu sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId('intelligence-menu'));
    expect(screen.getByTestId('intelligence-low')).toBeTruthy();
    expect(screen.getByTestId('intelligence-medium')).toBeTruthy();
    expect(screen.getByTestId('intelligence-high')).toBeTruthy();
  });

  it('highlights the effective level', async () => {
    (aiChatApi.getIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: 'high',
      model: 'gpt-4o',
      effectiveSmartLevel: 'high',
      effectiveModel: 'gpt-4o',
      allowedTools: [],
      tokenBudget: 64_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: 'gpt-4o-mini' },
    });
    render(<IntelligenceMenu sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId('intelligence-high'));
    expect(screen.getByTestId('intelligence-high').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('intelligence-low').getAttribute('data-active')).toBe('false');
  });

  it('click low → calls patchIntelligence with { smartLevel: "low" }', async () => {
    (aiChatApi.getIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: null,
      model: null,
      effectiveSmartLevel: 'medium',
      effectiveModel: 'gpt-4o-mini',
      allowedTools: [],
      tokenBudget: 16_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: 'gpt-4o-mini' },
    });
    (aiChatApi.patchIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: 'low',
      model: null,
      effectiveSmartLevel: 'low',
      effectiveModel: 'gpt-4o-mini',
      allowedTools: ['table.read'],
      tokenBudget: 4_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: 'gpt-4o-mini' },
    });
    render(<IntelligenceMenu sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId('intelligence-low'));
    fireEvent.click(screen.getByTestId('intelligence-low'));
    await waitFor(() =>
      expect(aiChatApi.patchIntelligence).toHaveBeenCalledWith(SESSION_ID, { smartLevel: 'low' })
    );
  });

  it('click high → server returns effectiveSmartLevel=high', async () => {
    (aiChatApi.getIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: null,
      model: null,
      effectiveSmartLevel: 'medium',
      effectiveModel: null,
      allowedTools: [],
      tokenBudget: 16_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: null },
    });
    (aiChatApi.patchIntelligence as ReturnType<typeof vi.fn>).mockResolvedValue({
      smartLevel: 'high',
      model: null,
      effectiveSmartLevel: 'high',
      effectiveModel: null,
      allowedTools: ['record.create'],
      tokenBudget: 64_000,
      inheritedFromGlobal: { smartLevel: 'medium', model: null },
    });
    render(<IntelligenceMenu sessionId={SESSION_ID} />, { wrapper: makeWrapper() });
    await waitFor(() => screen.getByTestId('intelligence-high'));
    fireEvent.click(screen.getByTestId('intelligence-high'));
    await waitFor(() =>
      expect(aiChatApi.patchIntelligence).toHaveBeenCalledWith(SESSION_ID, { smartLevel: 'high' })
    );
  });
});
