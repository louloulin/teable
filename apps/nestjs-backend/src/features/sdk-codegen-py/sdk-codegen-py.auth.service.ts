/**
 * SDK Code Generator (Python) — NestJS auth service (Stage 118).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  generatePySdk,
  groupByTagPy,
  jsTypeToPy,
  opToAsyncMethod,
  pathToFString,
  schemaToDataclass,
} from './sdk-codegen-py.service';
import {
  GeneratedPyFile,
  OpenApiDocumentPy,
  OpenApiOperationPy,
  OpenApiSchemaPy,
  PyCodegenResult,
} from './sdk-codegen-py.types';

@Injectable()
export class SdkCodegenPyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  generate(doc: OpenApiDocumentPy, pkg?: string, ver?: string): PyCodegenResult {
    return generatePySdk({ doc, packageName: pkg, version: ver });
  }

  grouped(doc: OpenApiDocumentPy): Record<string, OpenApiOperationPy[]> {
    return groupByTagPy(doc);
  }

  pyType(js: string): string {
    return jsTypeToPy(js);
  }

  pathF(path: string): string {
    return pathToFString(path);
  }

  schemaDC(schema: OpenApiSchemaPy): string {
    return schemaToDataclass(schema);
  }

  opMethod(op: OpenApiOperationPy): string {
    return opToAsyncMethod(op);
  }

  files(doc: OpenApiDocumentPy): readonly GeneratedPyFile[] {
    return generatePySdk({ doc }).files;
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