/**
 * AI field record listener module — Round 11 T-11.
 *
 * Wires the AI-field compute listener into Nest's DI graph. The listener
 * itself lives alongside the existing `AiService` under `features/ai/`,
 * keeping the dependency direction consistent (record layer depends on AI
 * layer, never the other way around).
 */
import { Module } from '@nestjs/common';
import { RecordModifyModule } from '../record/record-modify/record-modify.module';
import { TableDomainQueryModule } from '../table-domain';
import { AiModule } from './ai.module';
import { AiFieldRecordListener } from './ai-field-record.listener';

@Module({
  imports: [AiModule, RecordModifyModule, TableDomainQueryModule],
  providers: [AiFieldRecordListener],
  exports: [AiFieldRecordListener],
})
export class AiFieldRecordListenerModule {}
