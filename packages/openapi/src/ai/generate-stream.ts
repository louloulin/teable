import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';

export enum Task {
  Coding = 'coding',
  Embedding = 'embedding',
  Translation = 'translation',
  JsonOutput = 'json_output',
}

export const AI_GENERATE_STREAM = '/api/{baseId}/ai/generate-stream';

export const aiGenerateRoSchema = z.object({
  prompt: z.string(),
  task: z.enum(Task).optional().meta({
    description: 'Quick model selection via predefined task type',
    example: Task.Coding,
  }),
  modelKey: z.string().optional().meta({
    description: 'Specify an exact model configuration to use',
    example: 'openai@gpt-4o@custom-name',
  }),
  jsonMode: z.boolean().optional().meta({
    description:
      'Force the model to respond in JSON. Triggers provider-level response_format=json_object on MiniMax / OpenAI-compatible gateways.',
    example: true,
  }),
  jsonSchema: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({
      description:
        'Optional JSON schema the model must conform to. Forwarded as response_format.json_schema.',
    }),
});

export type IAiGenerateRo = z.infer<typeof aiGenerateRoSchema>;

export const aiGenerateVoSchema = z.object({
  result: z.string(),
});

export type IAiGenerateVo = z.infer<typeof aiGenerateVoSchema>;

export const aiGenerateRoute = registerRoute({
  method: 'post',
  path: AI_GENERATE_STREAM,
  description: 'Generate ai stream',
  request: {
    params: z.object({
      baseId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: aiGenerateRoSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Returns ai generate stream.',
      content: {
        'application/json': {
          schema: aiGenerateVoSchema,
        },
      },
    },
  },
  tags: ['ai'],
});

export const aiGenerateStream = (
  baseId: string,
  aiGenerateRo: IAiGenerateRo,
  signal?: AbortSignal
) => {
  return fetch(
    urlBuilder(AI_GENERATE_STREAM, {
      baseId,
    }),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(aiGenerateRo),
      signal,
    }
  );
};
