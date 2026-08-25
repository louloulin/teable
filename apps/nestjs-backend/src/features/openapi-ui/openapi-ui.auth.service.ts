/**
 * OpenAPI UI — NestJS auth service (Stage 106).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  escapeHtml,
  groupByVerb,
  isSafeRelativePath,
  renderBootstrapScript,
  renderEndpoint,
  renderHeader,
  renderHtmlDocument,
  renderOperationsSection,
  renderPage,
  renderSchemasSection,
  validateEndpointMarkup,
} from './openapi-ui.service';
import { OpenApiExportAuthService } from '../openapi-export/openapi-export.auth.service';
import type { IOpenApiDocument } from '../openapi-metadata/openapi-metadata.types';
import type { IExplorerPage, IRenderedEndpoint, IRenderedHeader } from './openapi-ui.types';

@Injectable()
export class OpenApiUiAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openApiExport: OpenApiExportAuthService
  ) {}

  /** Load the wired document. */
  async loadDoc(): Promise<IOpenApiDocument> {
    const ser = await this.openApiExport.serialize();
    const parsed = this.openApiExport.parse(ser.json);
    return parsed ?? { title: 'Empty', version: '0', operations: [], schemas: {} };
  }

  /** Render the full HTML page. */
  async page(input: { jsonPath: string }): Promise<{ html: string; meta: IExplorerPage }> {
    const doc = await this.loadDoc();
    const html = renderHtmlDocument({ doc, jsonPath: input.jsonPath });
    const meta = renderPage({ doc, jsonPath: input.jsonPath });
    return { html, meta };
  }

  /** Render endpoint markup for a single operation. */
  renderOp(op: import('../openapi-metadata/openapi-metadata.types').IOperationSpec): IRenderedEndpoint {
    return renderEndpoint(op);
  }

  /** Render header. */
  renderHead(input: { title: string; version: string; jsonPath: string }): IRenderedHeader {
    return renderHeader(input);
  }

  /** Group operations by verb. */
  groupByVerb(ops: ReadonlyArray<import('../openapi-metadata/openapi-metadata.types').IOperationSpec>) {
    return groupByVerb(ops);
  }

  /** Render operations section. */
  renderOps(ops: ReadonlyArray<import('../openapi-metadata/openapi-metadata.types').IOperationSpec>) {
    return renderOperationsSection(ops);
  }

  /** Render schemas section. */
  renderSchemas(schemas: Record<string, string>) {
    return renderSchemasSection(schemas);
  }

  /** Render bootstrap JS. */
  bootstrapScript(input: { jsonPath: string }): string {
    return renderBootstrapScript(input);
  }

  /** Validate endpoint markup size. */
  validateEndpoint(markup: string): string | null {
    return validateEndpointMarkup(markup);
  }

  /** Escape a value. */
  escape(s: string): string {
    return escapeHtml(s);
  }

  /** Path safety. */
  isSafePath(p: string): boolean {
    return isSafeRelativePath(p);
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
