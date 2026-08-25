/**
 * View Metadata Schema — NestJS auth service (Stage 112).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  addColumn,
  addCondFormat,
  addFilter,
  addGroup,
  addSort,
  emptyViewMetadata,
  listPinnedColumns,
  listVisibleColumns,
  migrateViewMetadata,
  removeColumn,
  reorderColumns,
  serializeViewMetadata,
  setColumnWidth,
  summarizeViewMetadata,
  toggleColumnHidden,
  toggleColumnPinned,
  totalWidth,
  validateViewMetadata,
} from './view-metadata-schema.service';
import {
  ViewColumnSpec,
  ViewCondFormatSpec,
  ViewFilterSpec,
  ViewGroupSpec,
  ViewKind,
  ViewMetadataSpec,
  ViewMetadataValidationResult,
  ViewSortSpec,
} from './view-metadata-schema.types';

@Injectable()
export class ViewMetadataSchemaAuthService {
  constructor(private readonly prisma: PrismaService) {}

  empty(id: string, name: string, kind: ViewKind): ViewMetadataSpec {
    return emptyViewMetadata({ id, name, kind });
  }

  validate(meta: ViewMetadataSpec): ViewMetadataValidationResult {
    return validateViewMetadata(meta);
  }

  addColumn(meta: ViewMetadataSpec, col: ViewColumnSpec): ViewMetadataSpec {
    return addColumn(meta, col);
  }

  removeColumn(meta: ViewMetadataSpec, id: string): ViewMetadataSpec {
    return removeColumn(meta, id);
  }

  reorderColumns(meta: ViewMetadataSpec, id: string, toIndex: number): ViewMetadataSpec {
    return reorderColumns(meta, id, toIndex);
  }

  setColumnWidth(meta: ViewMetadataSpec, id: string, width: number): ViewMetadataSpec {
    return setColumnWidth(meta, id, width);
  }

  toggleHidden(meta: ViewMetadataSpec, id: string): ViewMetadataSpec {
    return toggleColumnHidden(meta, id);
  }

  togglePinned(meta: ViewMetadataSpec, id: string): ViewMetadataSpec {
    return toggleColumnPinned(meta, id);
  }

  addFilter(meta: ViewMetadataSpec, filter: ViewFilterSpec): ViewMetadataSpec {
    return addFilter(meta, filter);
  }

  addSort(meta: ViewMetadataSpec, sort: ViewSortSpec): ViewMetadataSpec {
    return addSort(meta, sort);
  }

  addGroup(meta: ViewMetadataSpec, group: ViewGroupSpec): ViewMetadataSpec {
    return addGroup(meta, group);
  }

  addCondFormat(meta: ViewMetadataSpec, cf: ViewCondFormatSpec): ViewMetadataSpec {
    return addCondFormat(meta, cf);
  }

  visibleColumns(meta: ViewMetadataSpec): ViewColumnSpec[] {
    return listVisibleColumns(meta);
  }

  pinnedColumns(meta: ViewMetadataSpec): ViewColumnSpec[] {
    return listPinnedColumns(meta);
  }

  totalWidth(meta: ViewMetadataSpec): number {
    return totalWidth(meta);
  }

  summarize(meta: ViewMetadataSpec) {
    return summarizeViewMetadata(meta);
  }

  serialize(meta: ViewMetadataSpec): string {
    return serializeViewMetadata(meta);
  }

  migrate(meta: ViewMetadataSpec): ViewMetadataSpec {
    return migrateViewMetadata(meta);
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