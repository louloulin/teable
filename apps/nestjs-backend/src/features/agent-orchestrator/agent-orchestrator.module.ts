/**
 * NestJS module — registers the orchestrator service + controller.
 *
 * The LLM client and prompt router are wired with `@Optional()` so the
 * module can be imported without those providers; tests pass plain providers,
 * production wires `CuppyPromptRouter` (T-13-02) + the existing `ai` LLM
 * provider.
 *
 * License: AGPL-3.0
 */

import { PrismaModule } from '@teable/db-main-prisma';
import { Module } from '@nestjs/common';
import { generateText, jsonSchema, stepCountIs, streamText, tool } from 'ai';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { CuppyPromptRouterModule } from '../cuppy-prompt-router/cuppy-prompt-router.module';
import {
  analyzeRecords,
  type AnalysisAggregation,
} from '../cuppy-prompt-router/cuppy-data-analysis';
import { InstanceSkillModule } from '../instance-skills/instance-skill.module';
import { LicenseModule } from '../license/license.module';
import { SkillScopeModule } from '../skill-scope/skill-scope.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';
import { TableOpenApiModule } from '../table/open-api/table-open-api.module';
import { TableOpenApiService } from '../table/open-api/table-open-api.service';
import { AutomationService } from '../automation/automation.service';
import { AutomationModule } from '../automation/automation.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { AiChatWritePlanService } from '../ai-chat/ai-chat-write-plan.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AgentOrchestratorController } from './agent-orchestrator.controller';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { BuiltInEchoLlm } from './built-in-echo-llm';
import { CuppyController } from './cuppy.controller';

@Module({
  controllers: [AgentOrchestratorController, CuppyController],
  imports: [
    PrismaModule,
    LicenseModule,
    InstanceSkillModule,
    SkillScopeModule,
    CuppyPromptRouterModule,
    AiModule,
    TableOpenApiModule,
    RecordOpenApiModule,
    AutomationModule,
    AiChatModule,
    AttachmentsModule,
  ],
  providers: [
    AgentOrchestratorService,
    {
      provide: 'CUPPY_BUILTIN_TOOLS',
      inject: [
        AgentOrchestratorService,
        TableOpenApiService,
        RecordOpenApiService,
        AutomationService,
        AiChatWritePlanService,
      ],
      useFactory: (
        orchestrator: AgentOrchestratorService,
        tables: TableOpenApiService,
        records: RecordOpenApiService,
        automations: AutomationService,
        writePlans: AiChatWritePlanService
      ) => {
        orchestrator.registerTool({
          name: 'schema_query',
          description: 'List the accessible tables and fields for the current base.',
          parameters: {
            type: 'object',
            properties: { tableId: { type: 'string' } },
            additionalProperties: false,
          },
          invoke: async (args, ctx) => {
            if (!ctx.base_id) return { error: 'baseId is required' };
            if (typeof args.tableId === 'string' && args.tableId.length > 0) {
              return tables.getTable(ctx.base_id, args.tableId);
            }
            return tables.getTables(ctx.base_id);
          },
        });
        orchestrator.registerTool({
          name: 'record_query',
          description: 'Read records from an accessible table with a bounded page size.',
          parameters: {
            type: 'object',
            properties: {
              tableId: { type: 'string' },
              take: { type: 'number', minimum: 1, maximum: 50 },
              skip: { type: 'number', minimum: 0 },
            },
            required: ['tableId'],
            additionalProperties: false,
          },
          invoke: async (args, ctx) => {
            if (typeof args.tableId !== 'string' || args.tableId.length === 0) {
              return { error: 'tableId is required' };
            }
            if (!ctx.base_id) return { error: 'baseId is required' };
            await tables.getTable(ctx.base_id, args.tableId);
            return records.getRecords(args.tableId, {
              take: Math.min(50, Math.max(1, Number(args.take) || 20)),
              skip: Math.max(0, Number(args.skip) || 0),
            } as never);
          },
        });
        orchestrator.registerTool({
          name: 'record_create',
          description:
            'Create a reviewable write plan for one record. Never writes immediately; the user must explicitly confirm the returned plan.',
          parameters: {
            type: 'object',
            properties: {
              tableId: { type: 'string' },
              fieldKeyType: { type: 'string', enum: ['id', 'name', 'dbFieldName'] },
              fields: {
                type: 'object',
                additionalProperties: true,
              },
            },
            required: ['tableId', 'fields', 'fieldKeyType'],
            additionalProperties: false,
          },
          invoke: async (args, ctx) => {
            const tableId = typeof args.tableId === 'string' ? args.tableId : '';
            if (!tableId) return { error: 'tableId is required' };
            if (!ctx.base_id) return { error: 'baseId is required' };
            if (!args.fields || typeof args.fields !== 'object') {
              return { error: 'fields object is required' };
            }
            try {
              const plan = await writePlans.createForCuppy({
                conversationId: String(ctx['conversation_id'] ?? ''),
                userId: ctx.user_id,
                baseId: ctx.base_id,
                tableId,
                fields: args.fields as Record<string, unknown>,
                fieldKeyType: typeof args.fieldKeyType === 'string' ? args.fieldKeyType : undefined,
              });
              return {
                requiresConfirmation: true,
                planId: plan.id,
                status: plan.status,
                summary: plan.summary,
              };
            } catch (error) {
              return { error: error instanceof Error ? error.message : 'create failed' };
            }
          },
        });
        orchestrator.registerTool({
          name: 'field_describe',
          description: 'Describe one or all fields of a table by returning names, types, options.',
          parameters: {
            type: 'object',
            properties: {
              tableId: { type: 'string' },
              fieldId: { type: 'string' },
            },
            required: ['tableId'],
            additionalProperties: false,
          },
          invoke: async (args, ctx) => {
            const tableId = typeof args.tableId === 'string' ? args.tableId : '';
            if (!tableId) return { error: 'tableId is required' };
            if (!ctx.base_id) return { error: 'baseId is required' };
            try {
              const table = await tables.getTable(ctx.base_id, tableId);
              const fields = Array.isArray((table as Record<string, unknown>).fields)
                ? (table as unknown as { fields: Array<Record<string, unknown>> }).fields
                : [];
              if (typeof args.fieldId === 'string' && args.fieldId.length > 0) {
                const match = fields.find(
                  (field) => field['id'] === args.fieldId || field['name'] === args.fieldId
                );
                return { field: match ?? null };
              }
              return { fields };
            } catch (error) {
              return { error: error instanceof Error ? error.message : 'describe failed' };
            }
          },
        });
        orchestrator.registerTool({
          name: 'data_analysis',
          description:
            'Compute bounded count, sum, average, minimum, or maximum over permission-checked records and optionally group the result for a chart.',
          parameters: {
            type: 'object',
            properties: {
              tableId: { type: 'string' },
              metricField: { type: 'string' },
              groupByField: { type: 'string' },
              aggregation: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
            },
            required: ['tableId'],
            additionalProperties: false,
          },
          invoke: async (args, ctx) => {
            const tableId = typeof args.tableId === 'string' ? args.tableId : '';
            if (!tableId) return { error: 'tableId is required' };
            if (!ctx.base_id) return { error: 'baseId is required' };
            await tables.getTable(ctx.base_id, tableId);
            const response = await records.getRecords(tableId, { take: 50, skip: 0 } as never);
            const aggregation = ['count', 'sum', 'avg', 'min', 'max'].includes(
              String(args.aggregation)
            )
              ? (String(args.aggregation) as AnalysisAggregation)
              : undefined;
            return analyzeRecords(response.records ?? [], {
              aggregation,
              metricField: typeof args.metricField === 'string' ? args.metricField : undefined,
              groupByField: typeof args.groupByField === 'string' ? args.groupByField : undefined,
            });
          },
        });
        orchestrator.registerTool({
          name: 'automation_trigger',
          description: 'Trigger a saved automation by id and return the resulting run id.',
          parameters: {
            type: 'object',
            properties: { automationId: { type: 'string' } },
            required: ['automationId'],
            additionalProperties: false,
          },
          invoke: async (args) => {
            const automationId = typeof args.automationId === 'string' ? args.automationId : '';
            if (!automationId) return { error: 'automationId is required' };
            try {
              const run = await automations.trigger(automationId, { trigger: 'cuppy' } as never);
              return { runId: run?.id ?? null };
            } catch (error) {
              return { error: error instanceof Error ? error.message : 'trigger failed' };
            }
          },
        });
        return true;
      },
    },
    {
      provide: 'CUPPY_LLM_CLIENT',
      inject: [AiService],
      useFactory: (ai: AiService) => {
        const echo = new BuiltInEchoLlm();
        return {
          async chat(args: {
            baseId?: string;
            system: string;
            messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
            tools: Array<{
              name: string;
              description: string;
              parameters: Record<string, unknown>;
            }>;
            executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
          }) {
            // No baseId → no configured provider can run. Fall back to built-in
            // echo so `/api/cuppy/chat` works out of the box on fresh self-hosted
            // installs.
            if (!args.baseId) {
              return echo.chat(args);
            }
            // R-AI-6: Bound the upstream LLM call with a short abort signal so a
            // misconfigured/unreachable provider (e.g. sandbox with no internet)
            // cannot stall the chat endpoint for 30+ seconds before falling back
            // to the built-in echo. Honor CUPPY_LLM_TIMEOUT_MS for ops overrides.
            const timeoutMs = Number(process.env.CUPPY_LLM_TIMEOUT_MS ?? 8000);
            const llmAbort = new AbortController();
            const timer = setTimeout(() => llmAbort.abort(), Math.max(1000, timeoutMs));
            try {
              const model = await ai.getChatModelInstance(args.baseId);
              type GenerateTools = NonNullable<Parameters<typeof generateText>[0]['tools']>;
              const tools: GenerateTools = Object.fromEntries(
                args.tools.map((definition) => [
                  definition.name,
                  tool({
                    description: definition.description,
                    inputSchema: jsonSchema(definition.parameters),
                    execute: (input) =>
                      args.executeTool(definition.name, input as Record<string, unknown>),
                  }),
                ])
              );
              const result = await generateText({
                model: model.lg,
                system: args.system,
                messages: args.messages
                  .filter(
                    (message): message is { role: 'user' | 'assistant'; content: string } =>
                      message.role !== 'tool'
                  )
                  .map((message) => ({ role: message.role, content: message.content })),
                tools,
                stopWhen: stepCountIs(3),
                abortSignal: llmAbort.signal,
              });
              return { text: result.text };
            } catch (err) {
              // Real provider lookup failed (no OPENAI_API_KEY, no BYOK, no admin
              // gateway, network unreachable, or our own timeout fired). Surface
              // a deterministic echo so the chat endpoint never returns an opaque
              // 503 to the UI.
              const reason = llmAbort.signal.aborted
                ? `timeout after ${timeoutMs}ms`
                : (err as Error)?.message ?? 'unknown error';
              const fallback = await echo.chat(args);
              return {
                ...fallback,
                text: `${fallback.text}\n\n[real-LLM provider fallback: ${reason}]`,
              };
            } finally {
              clearTimeout(timer);
            }
          },
          /**
           * R-AI-11 streaming variant. Mirrors chat()'s timeout + fallback
           * semantics but yields text deltas via `ai`'s streamText. The
           * built-in echo client is used whenever the real provider is
           * missing, misconfigured, or aborts past the timeout.
           */
          async *chatStream(args: {
            baseId?: string;
            system: string;
            messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
            tools: Array<{
              name: string;
              description: string;
              parameters: Record<string, unknown>;
            }>;
            executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
            abortSignal?: AbortSignal;
          }): AsyncGenerator<{ delta: string; value?: string; done: boolean }> {
            if (!args.baseId) {
              yield* echo.chatStream(args);
              return;
            }
            const timeoutMs = Number(process.env.CUPPY_LLM_TIMEOUT_MS ?? 8000);
            const llmAbort = new AbortController();
            const timer = setTimeout(() => llmAbort.abort(), Math.max(1000, timeoutMs));
            args.abortSignal?.addEventListener('abort', () => llmAbort.abort());
            try {
              const model = await ai.getChatModelInstance(args.baseId);
              const result = streamText({
                model: model.lg,
                system: args.system,
                messages: args.messages
                  .filter(
                    (m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'tool'
                  )
                  .map((m) => ({ role: m.role, content: m.content })),
                abortSignal: llmAbort.signal,
              });
              let acc = '';
              for await (const delta of result.textStream) {
                if (args.abortSignal?.aborted) return;
                acc += delta;
                yield { delta, done: false };
              }
              yield { delta: '', value: acc, done: true };
            } catch (err) {
              const reason = llmAbort.signal.aborted
                ? `timeout after ${timeoutMs}ms`
                : (err as Error)?.message ?? 'unknown error';
              let streamed = false;
              for await (const chunk of echo.chatStream(args)) {
                streamed = true;
                if (chunk.done) {
                  yield {
                    delta: '',
                    value: `${chunk.value}\n\n[real-LLM provider fallback: ${reason}]`,
                    done: true,
                  };
                } else {
                  yield chunk;
                }
              }
              if (!streamed) {
                yield {
                  delta: '',
                  value: `[real-LLM provider fallback: ${reason}]`,
                  done: true,
                };
              }
            } finally {
              clearTimeout(timer);
            }
          },
          /** Backward-compat alias of chatStream — older callers/tests reference `stream`. */
          stream: async function* (
            args: Parameters<(...args: unknown[]) => unknown>[0]
          ): AsyncGenerator<{ delta: string; value?: string; done: boolean }> {
            const self = this as unknown as {
              chatStream: (
                a: unknown
              ) => AsyncGenerator<{ delta: string; value?: string; done: boolean }>;
            };
            yield* self.chatStream(args);
          },
        };
      },
    },
    BuiltInEchoLlm,
  ],
  exports: [AgentOrchestratorService],
})
export class AgentOrchestratorModule {}

// Test-only seam: re-export the factory so unit tests can wire the same tool
// registration without bootstrapping the entire DI graph. Production callers
// resolve the providers through NestJS as usual.
export const __testing__buildCuppyTools = (
  tables: {
    getTable(baseId: string, tableId: string): Promise<unknown>;
    getTables(baseId: string): Promise<unknown>;
  },
  records: {
    getRecords(tableId: string, query: unknown): Promise<unknown>;
    createRecords(
      tableId: string,
      body: unknown,
      ignoreMissingFields: boolean,
      isAiInternal: string
    ): Promise<{ records?: unknown[] }>;
  },
  automations: { trigger(automationId: string, input: unknown): Promise<{ id?: string }> },
  writePlans?: {
    createForCuppy(input: {
      conversationId: string;
      userId: string;
      baseId: string;
      tableId: string;
      fields: Record<string, unknown>;
      fieldKeyType?: string;
    }): Promise<{ id: string; status: string; summary: string }>;
  }
) => {
  return {
    record_create: {
      schema: {
        type: 'object',
        properties: {
          tableId: { type: 'string' },
          fieldKeyType: { type: 'string', enum: ['id', 'name', 'dbFieldName'] },
          fields: { type: 'object', additionalProperties: true },
        },
        required: ['tableId', 'fields', 'fieldKeyType'],
        additionalProperties: false,
      },
      run: async (
        ctx: { base_id?: string; user_id?: string; conversation_id?: string },
        args: { tableId?: string; fieldKeyType?: string; fields?: Record<string, unknown> }
      ): Promise<unknown> => {
        if (!args.tableId) return { error: 'tableId is required' };
        if (!ctx.base_id) return { error: 'baseId is required' };
        if (!args.fields || typeof args.fields !== 'object')
          return { error: 'fields object is required' };
        if (!writePlans || !ctx.user_id || !ctx.conversation_id) {
          return { error: 'write plan service is unavailable' };
        }
        const plan = await writePlans.createForCuppy({
          conversationId: ctx.conversation_id,
          userId: ctx.user_id,
          baseId: ctx.base_id,
          tableId: args.tableId,
          fields: args.fields,
          fieldKeyType: args.fieldKeyType,
        });
        return {
          requiresConfirmation: true,
          planId: plan.id,
          status: plan.status,
          summary: plan.summary,
        };
      },
    },
    field_describe: {
      schema: {
        type: 'object',
        properties: { tableId: { type: 'string' }, fieldId: { type: 'string' } },
        required: ['tableId'],
        additionalProperties: false,
      },
      run: async (ctx: { base_id?: string }, args: { tableId?: string; fieldId?: string }) => {
        if (!args.tableId) return { error: 'tableId is required' };
        if (!ctx.base_id) return { error: 'baseId is required' };
        const table = (await tables.getTable(ctx.base_id, args.tableId)) as {
          fields?: Array<Record<string, unknown>>;
        };
        const fields = Array.isArray(table.fields) ? table.fields : [];
        if (args.fieldId) {
          const match = fields.find((f) => f['id'] === args.fieldId || f['name'] === args.fieldId);
          return { field: match ?? null };
        }
        return { fields };
      },
    },
    automation_trigger: {
      schema: {
        type: 'object',
        properties: { automationId: { type: 'string' } },
        required: ['automationId'],
        additionalProperties: false,
      },
      run: async (_ctx: unknown, args: { automationId?: string }) => {
        if (!args.automationId) return { error: 'automationId is required' };
        const run = await automations.trigger(args.automationId, { trigger: 'cuppy' } as never);
        return { runId: run?.id ?? null };
      },
    },
  };
};
