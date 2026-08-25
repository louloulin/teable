import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { ConditionalFormatController } from './conditional-format.controller';
import { ConditionalFormatService } from './conditional-format.service';

/**
 * Conditional formatting module — Stage 18.
 *
 * Provides per-view rules that color rows or specific fields based on
 * a small DSL (eq/neq/gt/lt/contains/empty/not_empty/in). The
 * `evaluate()` method is pure so it can run on the read hot path
 * without re-querying the rules table per record.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ConditionalFormatController],
  providers: [ConditionalFormatService],
  exports: [ConditionalFormatService],
})
export class ConditionalFormatModule {}
