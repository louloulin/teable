/**
 * Automation Action Catalog — NestJS auth service (Stage 109).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BUILTIN_ACTION_CATALOG,
  capActionCatalog,
  computeRetryDelay,
  getActionSpec,
  groupActionsByCategory,
  indexActionCatalog,
  isRollbackable,
  listActionsByCategory,
  mergeActionCatalogs,
  serializeActionCatalog,
  summarizeActionCatalog,
  validateActionConfig,
} from './automation-action-catalog.service';
import {
  IActionCatalog,
  IActionRetrySpec,
  IActionTypeSpec,
  IActionValidationResult,
} from './automation-action-catalog.types';

@Injectable()
export class AutomationActionCatalogAuthService {
  private catalog: IActionCatalog = BUILTIN_ACTION_CATALOG;

  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): IActionCatalog {
    return this.catalog;
  }

  setCatalog(cat: IActionCatalog): IActionCatalog {
    this.catalog = capActionCatalog(cat);
    return this.catalog;
  }

  extend(ext: IActionCatalog): IActionCatalog {
    return this.setCatalog(mergeActionCatalogs(this.catalog, ext));
  }

  get(type: string): IActionTypeSpec | undefined {
    return getActionSpec(this.catalog, type);
  }

  listByCategory(category: string): IActionTypeSpec[] {
    return listActionsByCategory(this.catalog, category);
  }

  groupByCategory(): Record<string, IActionTypeSpec[]> {
    return groupActionsByCategory(this.catalog);
  }

  index(): Map<string, IActionTypeSpec> {
    return indexActionCatalog(this.catalog);
  }

  validate(type: string, config: Record<string, unknown>): IActionValidationResult {
    return validateActionConfig(this.catalog, type, config);
  }

  computeRetry(retry: IActionRetrySpec): number {
    return computeRetryDelay(retry);
  }

  rollbackable(type: string): boolean {
    return isRollbackable(this.catalog, type);
  }

  serialize(): string {
    return serializeActionCatalog(this.catalog);
  }

  summarize() {
    return summarizeActionCatalog(this.catalog);
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