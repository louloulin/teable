import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { AUTOMATION_ACTION_TYPES, AUTOMATION_TRIGGER_TYPES } from './automation.types';
import type {
  IAutomationAiDraftInput,
  IAutomationAiDraftResult,
  IAutomationDraft,
} from './automation.types';

const MAX_PROMPT_LENGTH = 4_000;
const MAX_ACTIONS = 12;
const MAX_TRIGGERS = 4;

interface IGeneratedDraft {
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  triggers?: unknown;
  actions?: unknown;
}

@Injectable()
export class AutomationAiBuilderService {
  constructor(private readonly ai: AiService) {}

  async generate(input: IAutomationAiDraftInput): Promise<IAutomationAiDraftResult> {
    const prompt = this.sanitizePrompt(input.prompt);
    if (!input.baseId) throw new BadRequestException('baseId is required');

    if (input.offline) {
      return {
        source: 'offline',
        model: 'offline/automation-v1',
        draft: this.buildOfflineDraft(prompt),
      };
    }

    const model = input.modelKey ?? 'configured automation model';
    let raw: string;
    try {
      raw = await this.ai.generateText(input.baseId, {
        prompt: this.buildPrompt(prompt),
        ...(input.modelKey ? { modelKey: input.modelKey } : {}),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `automation AI provider unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return { source: 'ai', model, draft: this.parseDraft(raw) };
  }

  private sanitizePrompt(prompt: string): string {
    if (typeof prompt !== 'string') throw new BadRequestException('prompt is required');
    const sanitized = Array.from(prompt)
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .trim();
    if (sanitized.length < 8) throw new BadRequestException('prompt is too short');
    if (sanitized.length > MAX_PROMPT_LENGTH) {
      throw new BadRequestException('prompt is too long');
    }
    return sanitized;
  }

  private buildPrompt(prompt: string): string {
    return [
      'You are Teable automation designer.',
      'Return only valid JSON with this shape:',
      '{"name":"string","description":"string","enabled":false,"triggers":[{"type":"record_created|record_updated|record_deleted|record_matches_conditions|schedule|button_clicked|form_submitted|webhook_received|email_received","tableId":"optional string","config":{}}],"actions":[{"type":"create_record|get_records|http_request|update_record|conditional_logic|ai_generate|webhook|email|slack|discord|telegram|teams|run_script|send_email|call_webhook|notify_user|ai_prompt|send_teams_message|send_feishu_message","orderIndex":0,"config":{}}]}',
      'Use the smallest safe workflow that satisfies the request.',
      'Never put credentials, tokens, passwords, or API keys in config; use {{secrets.NAME}} references.',
      'Always return enabled=false. The user must review and Apply Update before activation.',
      `User request: ${prompt}`,
    ].join('\n');
  }

  private parseDraft(raw: string): IAutomationDraft {
    let parsed: IGeneratedDraft;
    try {
      parsed = JSON.parse(this.repairJson(raw)) as IGeneratedDraft;
    } catch {
      throw new BadRequestException('automation AI returned invalid JSON');
    }

    const draft = this.validateDraft(parsed);
    return { ...draft, enabled: false };
  }

  private validateDraft(value: IGeneratedDraft): IAutomationDraft {
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name || name.length > 120)
      throw new BadRequestException('automation draft name is invalid');
    const description =
      typeof value.description === 'string' ? value.description.slice(0, 1_000) : undefined;
    if (
      !Array.isArray(value.triggers) ||
      value.triggers.length === 0 ||
      value.triggers.length > MAX_TRIGGERS
    ) {
      throw new BadRequestException('automation draft must contain 1-4 triggers');
    }
    if (
      !Array.isArray(value.actions) ||
      value.actions.length === 0 ||
      value.actions.length > MAX_ACTIONS
    ) {
      throw new BadRequestException('automation draft must contain 1-12 actions');
    }

    const triggers = value.triggers.map((item) => this.validateTrigger(item));
    const actions = value.actions.map((item, index) => this.validateAction(item, index));
    return { name, description, enabled: false, triggers, actions };
  }

  private validateTrigger(value: unknown): IAutomationDraft['triggers'][number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('automation trigger must be an object');
    }
    const trigger = value as Record<string, unknown>;
    const type = trigger.type;
    if (typeof type !== 'string' || !AUTOMATION_TRIGGER_TYPES.includes(type as never)) {
      throw new BadRequestException(`unsupported automation trigger: ${String(type)}`);
    }
    return {
      type: type as IAutomationDraft['triggers'][number]['type'],
      ...(typeof trigger.tableId === 'string' ? { tableId: trigger.tableId } : {}),
      config: this.configObject(trigger.config),
    };
  }

  private validateAction(value: unknown, index: number): IAutomationDraft['actions'][number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('automation action must be an object');
    }
    const action = value as Record<string, unknown>;
    const type = action.type;
    if (typeof type !== 'string' || !AUTOMATION_ACTION_TYPES.includes(type as never)) {
      throw new BadRequestException(`unsupported automation action: ${String(type)}`);
    }
    const config = this.configObject(action.config);
    if (type === 'conditional_logic') this.validateConditionalConfig(config);
    return {
      type: type as IAutomationDraft['actions'][number]['type'],
      orderIndex: typeof action.orderIndex === 'number' ? action.orderIndex : index,
      config,
    };
  }

  private validateConditionalConfig(config: Record<string, unknown>): void {
    const conditions = config.conditions;
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new BadRequestException('conditional_logic requires conditions');
    }
    for (const branchKey of ['ifTrue', 'ifFalse', 'then', 'else']) {
      const branch = config[branchKey];
      if (branch === undefined) continue;
      if (!Array.isArray(branch) || branch.length > MAX_ACTIONS) {
        throw new BadRequestException(`conditional_logic ${branchKey} must be an action list`);
      }
      branch.forEach((item, index) => this.validateAction(item, index));
    }
  }

  private configObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const serialized = JSON.stringify(value);
    if (serialized.length > 32_000) throw new BadRequestException('automation config is too large');
    return this.sanitizeConfig(value as Record<string, unknown>);
  }

  private sanitizeConfig(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const normalized = key.toLowerCase();
        const isSensitive =
          normalized.includes('secret') ||
          normalized.includes('token') ||
          normalized.includes('password') ||
          normalized.includes('apikey') ||
          normalized.includes('api_key') ||
          normalized.includes('api-key') ||
          normalized === 'authorization';
        if (
          isSensitive &&
          (typeof nested !== 'string' || !/^\{\{secrets\.[A-Z][A-Z0-9_]*\}\}$/.test(nested))
        ) {
          throw new BadRequestException(`sensitive config key must use a secret reference: ${key}`);
        }
        return [key, this.sanitizeNested(nested)];
      })
    );
  }

  private sanitizeNested(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitizeNested(item));
    if (value && typeof value === 'object')
      return this.sanitizeConfig(value as Record<string, unknown>);
    return value;
  }

  private repairJson(raw: string): string {
    const trimmed = raw.trim();
    const withoutFence = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
      : trimmed;
    return withoutFence.replace(/,\s*([}\]])/g, '$1');
  }

  private buildOfflineDraft(prompt: string): IAutomationDraft {
    const lower = prompt.toLowerCase();
    const trigger = lower.includes('webhook')
      ? { type: 'webhook_received' as const, config: {} }
      : lower.includes('email received') || lower.includes('incoming email')
        ? { type: 'email_received' as const, config: {} }
        : lower.includes('schedule') || lower.includes('every')
          ? { type: 'schedule' as const, config: { cron: '0 9 * * 1-5' } }
          : { type: 'record_created' as const, config: {} };
    const action = lower.includes('email')
      ? {
          type: 'email' as const,
          config: {
            to: '{{trigger.user.email}}',
            subject: prompt.slice(0, 120),
            body: '{{input}}',
          },
        }
      : lower.includes('webhook') || lower.includes('http')
        ? {
            type: 'http_request' as const,
            config: { method: 'POST', url: '{{secrets.WEBHOOK_URL}}' },
          }
        : { type: 'run_script' as const, config: { script: 'return input;' } };
    return {
      name: prompt.split(/[.!?\n]/)[0].slice(0, 120),
      description: `Offline draft generated from: ${prompt}`.slice(0, 1_000),
      enabled: false,
      triggers: [trigger],
      actions: [{ ...action, orderIndex: 0 }],
    };
  }
}
