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

import { Module } from '@nestjs/common';
import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { CuppyPromptRouterModule } from '../cuppy-prompt-router/cuppy-prompt-router.module';
import { InstanceSkillModule } from '../instance-skills/instance-skill.module';
import { LicenseModule } from '../license/license.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';
import { TableOpenApiModule } from '../table/open-api/table-open-api.module';
import { TableOpenApiService } from '../table/open-api/table-open-api.service';
import { AgentOrchestratorController } from './agent-orchestrator.controller';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { BuiltInEchoLlm } from './built-in-echo-llm';
import { CuppyController } from './cuppy.controller';

@Module({
  controllers: [AgentOrchestratorController, CuppyController],
  imports: [
    LicenseModule,
    InstanceSkillModule,
    CuppyPromptRouterModule,
    AiModule,
    TableOpenApiModule,
    RecordOpenApiModule,
  ],
  providers: [
    AgentOrchestratorService,
    {
      provide: 'CUPPY_BUILTIN_TOOLS',
      inject: [AgentOrchestratorService, TableOpenApiService, RecordOpenApiService],
      useFactory: (
        orchestrator: AgentOrchestratorService,
        tables: TableOpenApiService,
        records: RecordOpenApiService
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
              });
              return { text: result.text };
            } catch {
              // Real provider lookup failed (no OPENAI_API_KEY, no BYOK, no admin
              // gateway). Surface a deterministic echo so the chat endpoint never
              // returns an opaque 503 to the UI.
              return echo.chat(args);
            }
          },
        };
      },
    },
    BuiltInEchoLlm,
  ],
  exports: [AgentOrchestratorService],
})
export class AgentOrchestratorModule {}
