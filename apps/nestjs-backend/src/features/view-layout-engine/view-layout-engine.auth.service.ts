/**
 * View Layout Engine — NestJS auth service (Stage 113).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import {
  computeLayout,
  effectiveViewport,
  layoutCalendar,
  layoutForm,
  layoutGallery,
  layoutGrid,
  layoutKanban,
  layoutMap,
  layoutTimeline,
} from './view-layout-engine.service';
import {
  CalendarLayoutSpec,
  FormLayoutSpec,
  GalleryLayoutSpec,
  GridLayoutSpec,
  KanbanLayoutSpec,
  MapLayoutSpec,
  TimelineLayoutSpec,
  ViewLayoutSpec,
  ViewportSpec,
} from './view-layout-engine.types';

@Injectable()
export class ViewLayoutEngineAuthService {
  constructor(private readonly prisma: PrismaService) {}

  layout(
    meta: ViewMetadataSpec,
    viewport: ViewportSpec,
    input: { rows?: number; buckets?: ReadonlyArray<{ id: string; label: string; count: number }>; cards?: number; year?: number; month?: number; markers?: ReadonlyArray<{ lat: number; lng: number }>; barLabels?: readonly string[] } = {},
  ): ViewLayoutSpec {
    return computeLayout(meta, viewport, input);
  }

  grid(meta: ViewMetadataSpec, viewport: ViewportSpec, rows: number): GridLayoutSpec {
    return layoutGrid(meta, viewport, rows);
  }

  kanban(meta: ViewMetadataSpec, viewport: ViewportSpec, buckets: ReadonlyArray<{ id: string; label: string; count: number }>): KanbanLayoutSpec {
    return layoutKanban(meta, viewport, buckets);
  }

  gallery(meta: ViewMetadataSpec, viewport: ViewportSpec, cards: number): GalleryLayoutSpec {
    return layoutGallery(meta, viewport, cards);
  }

  calendar(viewport: ViewportSpec, year: number, month: number): CalendarLayoutSpec {
    return layoutCalendar(viewport, year, month);
  }

  form(meta: ViewMetadataSpec, viewport: ViewportSpec): FormLayoutSpec {
    return layoutForm(meta, viewport);
  }

  map(viewport: ViewportSpec, markers: ReadonlyArray<{ lat: number; lng: number }>): MapLayoutSpec {
    return layoutMap(viewport, markers);
  }

  timeline(viewport: ViewportSpec, labels: readonly string[]): TimelineLayoutSpec {
    return layoutTimeline(viewport, labels.length, labels);
  }

  effectiveViewport(vp: ViewportSpec): ViewportSpec {
    return effectiveViewport(vp);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}