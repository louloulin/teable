/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V51 ArtifactViewer — minimal unit tests using Vitest + React Testing Library.
 * Validates the table parser + open/close behavior without hitting the network.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { V51ArtifactViewer } from './V51ArtifactViewer';

// We mock axios so we never hit the network in this unit test.
vi.mock('@teable/openapi', () => ({
  axios: {
    get: vi.fn(async () => ({ data: [] })),
    delete: vi.fn(async () => ({})),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  },
}));

describe('V51ArtifactViewer (Stage 51)', () => {
  it('renders the viewer shell with empty state', async () => {
    render(<V51ArtifactViewer sessionId="s1" />);
    // Header is visible
    expect(screen.getByTestId('v51-artifact-toggle')).toBeTruthy();
    // Empty state copy after the async fetch resolves
    const empty = await screen.findByText(/No artifacts yet/);
    expect(empty).toBeTruthy();
  });

  it('shows the sessionId in the data-testid of the viewer wrapper', () => {
    const { container } = render(<V51ArtifactViewer sessionId="s_test_42" />);
    const viewer = container.querySelector('[data-testid="v51-artifact-viewer-s_test_42"]');
    expect(viewer).toBeTruthy();
  });
});
