/**
 * Automation Trigger Catalog — NestJS auth service (Stage 108).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BUILTIN_TRIGGER_CATALOG,
  capTriggerCatalog,
  getTriggerSpec,
  groupTriggersByCategory,
  indexTriggerCatalog,
  listTriggersByCategory,
  mergeTriggerCatalogs,
  missingTriggerFields,
  hasTriggerOutputKey,
  serializeTriggerCatalog,
  summarizeTriggerCatalog,
  validateTriggerConfig,
} from './automation-trigger-catalog.service';
import {
  ITriggerCatalog,
  ITriggerTypeSpec,
  ITriggerValidationResult,
} from './automation-trigger-catalog.types';

@Injectable()
export class AutomationTriggerCatalogAuthService {
  private catalog: ITriggerCatalog = BUILTIN_TRIGGER_CATALOG;

  constructor(private readonly prisma: PrismaService) {}

  /** Get the (mutable in-memory) catalog. */
  getCatalog(): ITriggerCatalog {
    return this.catalog;
  }

  /** Replace the in-memory catalog (call once at boot). */
  setCatalog(cat: ITriggerCatalog): ITriggerCatalog {
    this.catalog = capTriggerCatalog(cat);
    return this.catalog;
  }

  /** Merge an extension catalog on top. */
  extend(ext: ITriggerCatalog): ITriggerCatalog {
    return this.setCatalog(mergeTriggerCatalogs(this.catalog, ext));
  }

  /** Lookup a single spec. */
  get(type: string): ITriggerTypeSpec | undefined {
    return getTriggerSpec(this.catalog, type);
  }

  /** List types by category. */
  listByCategory(category: string): ITriggerTypeSpec[] {
    return listTriggersByCategory(this.catalog, category);
  }

  /** Group types by category. */
  groupByCategory(): Record<string, ITriggerTypeSpec[]> {
    return groupTriggersByCategory(this.catalog);
  }

  /** Index (rebuild). */
  index(): Map<string, ITriggerTypeSpec> {
    return indexTriggerCatalog(this.catalog);
  }

  /** Validate a config payload against the type. */
  validate(type: string, config: Record<string, unknown>): ITriggerValidationResult {
    return validateTriggerConfig(this.catalog, type, config);
  }

  /** Missing required fields. */
  missing(type: string, config: Record<string, unknown>): string[] {
    return missingTriggerFields(this.catalog, type, config);
  }

  /** Whether output key is exposed. */
  hasOutput(type: string, key: string): boolean {
    return hasTriggerOutputKey(this.catalog, type, key);
  }

  /** Serialize deterministically. */
  serialize(): string {
    return serializeTriggerCatalog(this.catalog);
  }

  /** Summary stats. */
  summarize() {
    return summarizeTriggerCatalog(this.catalog);
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