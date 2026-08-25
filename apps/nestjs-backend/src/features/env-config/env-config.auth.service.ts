/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Env config — NestJS auth service (Stage 96).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  banner,
  boolEnv,
  numberEnv,
  optional,
  required,
  resolveAll,
  validateEnvSpec,
} from './env-config.service';
import type { IEnvReport, IEnvSpec } from './env-config.types';

@Injectable()
export class EnvConfigAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert an env spec. */
  async upsertSpec(input: { spec: IEnvSpec }): Promise<IEnvSpec> {
    const err = validateEnvSpec(input.spec);
    if (err) throw new Error(err);
    await this.prisma.envSpec.upsert({
      where: { id: input.spec.name },
      create: {
        id: input.spec.name,
        name: input.spec.name,
        kind: input.spec.kind,
        required: input.spec.required,
        defaultValue: input.spec.default === undefined ? null : String(input.spec.default),
        enumValues: input.spec.enumValues ? (input.spec.enumValues as object) : null,
        description: input.spec.description ?? null,
      },
      update: {
        kind: input.spec.kind,
        required: input.spec.required,
        defaultValue: input.spec.default === undefined ? null : String(input.spec.default),
        enumValues: input.spec.enumValues ? (input.spec.enumValues as object) : null,
        description: input.spec.description ?? null,
      },
    });
    return input.spec;
  }

  /** Load all specs and resolve against a provided env map. */
  async resolve(input: { env: Record<string, string | undefined> }): Promise<IEnvReport> {
    const rows = await this.prisma.envSpec.findMany();
    const specs = rows.map(rowToSpec);
    return resolveAll({ specs, env: input.env });
  }

  /** Render a banner from the report. */
  banner(report: IEnvReport): string {
    return banner(report);
  }

  /** Pass-through helpers — for ergonomic calls from AppModule. */
  bool(input: {
    name: string;
    env: Record<string, string | undefined>;
    fallback?: boolean;
  }): boolean {
    return boolEnv(input);
  }
  num(input: {
    name: string;
    env: Record<string, string | undefined>;
    fallback: number;
  }): number {
    return numberEnv(input);
  }
  opt(input: {
    name: string;
    env: Record<string, string | undefined>;
    fallback: string;
  }): string {
    return optional(input);
  }
  req(input: {
    name: string;
    env: Record<string, string | undefined>;
  }): string {
    return required(input);
  }

  /** Combined: load + resolve + validate, returns the values map. */
  async loadValidated(input: {
    env: Record<string, string | undefined>;
  }): Promise<{ values: Record<string, string | number | boolean>; report: IEnvReport }> {
    const report = await this.resolve({ env: input.env });
    if (!report.valid) {
      throw new Error(`env invalid: ${report.issues.join('; ')}`);
    }
    return { values: report.values, report };
  }
}

function rowToSpec(r: Record<string, unknown>): IEnvSpec {
  return {
    name: String(r['name']),
    kind: r['kind'] as 'string' | 'number' | 'boolean' | 'enum',
    required: Boolean(r['required']),
    default: r['defaultValue'] as IEnvSpec['default'],
    enumValues: (r['enumValues'] as string[]) ?? undefined,
    description: (r['description'] as string) ?? undefined,
  };
}