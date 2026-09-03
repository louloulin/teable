import { ViewType } from '@teable/core';
import {
  Sheet,
  ClipboardList as Form,
  LayoutGrid as Gallery,
  Kanban,
  Component,
  Calendar,
  Table2,
} from '@teable/icons';

export const VIEW_ICON_MAP = {
  [ViewType.Grid]: Sheet,
  [ViewType.Kanban]: Kanban,
  [ViewType.Gallery]: Gallery,
  [ViewType.Calendar]: Calendar,
  [ViewType.Form]: Form,
  [ViewType.Plugin]: Component,
  [ViewType.Pivot]: Table2,
};
