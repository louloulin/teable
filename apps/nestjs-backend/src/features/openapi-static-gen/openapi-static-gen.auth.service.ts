/**
 * OpenAPI static generation — NestJS auth service (Stage 105).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  allHashed,
  artifactCount,
  capArtifacts,
  changedFrom,
  findArtifact,
  hasHtmlArtifact,
  hasJsonArtifact,
  jsonArtifactPath,
  htmlArtifactPath,
  planBuild,
  sha256,
  validateBuildInput,
} from './openapi-static-gen.service';
import { OpenApiExportAuthService } from '../openapi-export/openapi-export.auth.service';
import type { IStaticBuildInput, IStaticBuildPlan } from './openapi-static-gen.types';

@Injectable()
export class OpenApiStaticGenAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openApiExport: OpenApiExportAuthService
  ) {}

  /** Load the wired document + serialize. */
  async serialize() {
    return this.openApiExport.serialize();
  }

  /** Plan a build with the wired document + optional html body. */
  async plan(input: { root: string; htmlBody?: string; name?: string }): Promise<IStaticBuildPlan> {
    const ser = await this.serialize();
    return planBuild({
      root: input.root,
      prettyJson: ser.pretty,
      htmlBody: input.htmlBody,
    });
  }

  /** Validate input. */
  validate(input: IStaticBuildInput): string | null {
    return validateBuildInput(input);
  }

  /** Helpers — re-exports. */
  jsonPath(input: { root: string; subdir?: string; name?: string }): string {
    return jsonArtifactPath(input);
  }

  htmlPath(input: { root: string; subdir?: string }): string {
    return htmlArtifactPath(input);
  }

  hash(s: string): string {
    return sha256(s);
  }

  find(plan: IStaticBuildPlan, path: string) {
    return findArtifact({ plan, path });
  }

  hasJson(plan: IStaticBuildPlan): boolean {
    return hasJsonArtifact(plan);
  }

  hasHtml(plan: IStaticBuildPlan): boolean {
    return hasHtmlArtifact(plan);
  }

  count(plan: IStaticBuildPlan): number {
    return artifactCount(plan);
  }

  cap(plan: IStaticBuildPlan, n: number): IStaticBuildPlan {
    return capArtifacts(plan, n);
  }

  hashed(plan: IStaticBuildPlan): boolean {
    return allHashed(plan);
  }

  changed(input: { plan: IStaticBuildPlan; previous: IStaticBuildPlan }): boolean {
    return changedFrom(input);
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
