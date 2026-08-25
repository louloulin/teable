/**
 * SDK Code Generator (JS/TS) — NestJS auth service (Stage 117).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  generateSdk,
  groupByTag,
  opToMethod,
  pathToColonForm,
  schemaToInterface,
  tsTypeOf,
} from './sdk-codegen-js.service';
import {
  GeneratedSdkFile,
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSchema,
  SdkCodegenResult,
} from './sdk-codegen-js.types';

@Injectable()
export class SdkCodegenJsAuthService {
  constructor(private readonly prisma: PrismaService) {}

  generate(doc: OpenApiDocument, pkg?: string, ver?: string): SdkCodegenResult {
    return generateSdk({ doc, packageName: pkg, version: ver });
  }

  grouped(doc: OpenApiDocument): Record<string, OpenApiOperation[]> {
    return groupByTag(doc);
  }

  pathForm(path: string): string {
    return pathToColonForm(path);
  }

  schemaIface(schema: OpenApiSchema): string {
    return schemaToInterface(schema);
  }

  opMethod(op: OpenApiOperation): string {
    return opToMethod(op, new Map());
  }

  tsType(p: OpenApiParameter): string {
    return tsTypeOf(p);
  }

  files(doc: OpenApiDocument): readonly GeneratedSdkFile[] {
    return generateSdk({ doc }).files;
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