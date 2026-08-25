/**
 * View Config Panel API — NestJS auth service (Stage 115).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import {
  applyPatches,
  buildPanelResponse,
  canEdit,
  diffMetadata,
  hashMetadata,
  processPatchRequest,
} from './view-config-panel-api.service';
import {
  ViewConfigPanelPatchResponse,
  ViewConfigPanelRequest,
  ViewConfigPanelResponse,
  ViewConfigPanelSection,
} from './view-config-panel-api.types';

@Injectable()
export class ViewConfigPanelApiAuthService {
  constructor(private readonly prisma: PrismaService) {}

  build(req: ViewConfigPanelRequest, meta: ViewMetadataSpec, role: string | undefined): ViewConfigPanelResponse {
    return buildPanelResponse(req, meta, canEdit(role));
  }

  hash(meta: ViewMetadataSpec): string {
    return hashMetadata(meta);
  }

  apply(meta: ViewMetadataSpec, patches: readonly ViewConfigPanelSection[]) {
    return applyPatches(meta, patches);
  }

  process(meta: ViewMetadataSpec, baseHash: string, patches: readonly ViewConfigPanelSection[]) {
    return processPatchRequest(meta, baseHash, patches);
  }

  diff(prev: ViewMetadataSpec, next: ViewMetadataSpec): string[] {
    return diffMetadata(prev, next);
  }

  canEdit(role: string | undefined): boolean {
    return canEdit(role);
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