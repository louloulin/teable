/**
 * OpenAPI export — NestJS auth service (Stage 103).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildExportPath,
  capTargets,
  defaultTargetFor,
  enabledTargets,
  parsePayload,
  planExport,
  serializeDocument,
  validateShape,
  validateTarget,
} from './openapi-export.service';
import { OpenApiMetadataAuthService } from '../openapi-metadata/openapi-metadata.auth.service';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';
import type {
  IExportPlan,
  IOpenApiExportTarget,
  ISerializedDocument,
} from './openapi-export.types';

@Injectable()
export class OpenApiExportAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openApiMetadata: OpenApiMetadataAuthService
  ) {}

  /** Load the document from the wired openapi-metadata service. */
  async loadDocument(input?: { title?: string; version?: string }): Promise<IOpenApiDocument> {
    return this.openApiMetadata.loadDocument({
      title: input?.title ?? 'Teable API',
      version: input?.version ?? '1.0.0',
    });
  }

  /** Serialize the wired document into JSON. */
  async serialize(): Promise<ISerializedDocument> {
    const doc = await this.loadDocument();
    return serializeDocument(doc);
  }

  /** Validate a target. */
  validateTarget(t: IOpenApiExportTarget): string | null {
    return validateTarget(t);
  }

  /** Validate a document shape. */
  validateShape(doc: IOpenApiDocument): string | null {
    return validateShape(doc);
  }

  /** Default target for the wired document. */
  async defaultTarget(input: { root: string }): Promise<IOpenApiExportTarget> {
    const doc = await this.loadDocument();
    return defaultTargetFor({ doc, root: input.root });
  }

  /** Build path for a name. */
  buildPath(input: { name: string; root: string }): string {
    return buildExportPath(input);
  }

  /** Plan an export. */
  async plan(input: { target: IOpenApiExportTarget }): Promise<IExportPlan> {
    const doc = await this.loadDocument();
    return planExport({ doc, target: input.target });
  }

  /** Cap and filter targets. */
  processTargets(input: { targets: ReadonlyArray<IOpenApiExportTarget> }): IOpenApiExportTarget[] {
    return enabledTargets(capTargets(input.targets));
  }

  /** Parse a payload back to a document. */
  parse(raw: string): IOpenApiDocument | null {
    return parsePayload(raw);
  }

  /** Health probe. */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
