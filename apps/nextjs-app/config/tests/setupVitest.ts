import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('@teable/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@teable/core');
  const noop = class NoopCore {
    tableId: string;
    id: string;
    options: Record<string, unknown> = {};
  };
  return {
    ...actual,
    PivotViewCore: noop,
    GridViewCore: noop,
    KanbanViewCore: noop,
    FormViewCore: noop,
    CalendarViewCore: noop,
    GalleryViewCore: noop,
  };
});
