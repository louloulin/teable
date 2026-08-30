import vm from 'node:vm';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FieldKeyType } from '@teable/core';
import type { ICreateRecordsRo, IGetRecordsRo, IUpdateRecordRo } from '@teable/openapi';

import type {
  RecordCreateEvent,
  RecordDeleteEvent,
  RecordUpdateEvent,
} from '../../event-emitter/events';
import { Events } from '../../event-emitter/events';
import { safeFetch } from '../../utils/ssrf-http';
import { AiService } from '../ai/ai.service';
import { TeamsAdapter } from '../im-bridge/teams.adapter';
import { MailSenderService } from '../mail-sender/mail-sender.service';
import { NotificationService } from '../notification/notification.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';

import { AutomationRateLimitService } from './automation-rate-limit.service';
import { AutomationService } from './automation.service';
import type { IAutomationCondition } from './automation.types';
import { IMBridgeService } from './im-bridge.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';

type IActionResult = { failed: boolean; output?: unknown };

@Injectable()
export class AutomationEventListener {
  private readonly logger = new Logger(AutomationEventListener.name);

  constructor(
    private readonly automation: AutomationService,
    private readonly webhook: WebhookDispatcher,
    private readonly imBridge: IMBridgeService,
    private readonly recordOpenApi: RecordOpenApiService,
    private readonly mailSender: MailSenderService,
    private readonly rateLimit?: AutomationRateLimitService,
    private readonly aiService?: AiService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly teamsAdapter?: TeamsAdapter
  ) {}

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  @OnEvent(Events.TABLE_RECORD_DELETE, { async: true })
  async handle(event: RecordCreateEvent | RecordUpdateEvent | RecordDeleteEvent): Promise<void> {
    const triggerType = this.getTriggerType(event);
    await this.dispatchEvent(
      triggerType,
      event.payload as unknown as Record<string, unknown>,
      event.context.user?.id
    );
  }

  @OnEvent(Events.TABLE_BUTTON_CLICK, { async: true })
  async handleButton(event: {
    payload: Record<string, unknown>;
    context?: { user?: { id: string } };
  }) {
    await this.dispatchEvent('button_clicked', event.payload, event.context?.user?.id);
  }

  @OnEvent(Events.TABLE_FORM_SUBMIT, { async: true })
  async handleFormSubmit(event: {
    payload: Record<string, unknown>;
    context?: { user?: { id: string } };
  }) {
    await this.dispatchEvent('form_submitted', event.payload, event.context?.user?.id);
  }

  async dispatchTrigger(
    automationId: string,
    triggerType: 'schedule' | 'webhook_received' | 'email_received',
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const { run, actions } = await this.automation.triggerWithActions(automationId, {
        triggerType,
        payload,
      });
      if (run.status === 'pending') {
        await this.executeRun(run.id, actions, payload, triggerType);
      }
    } catch (error) {
      this.logger.error(
        `automation trigger failed: ${automationId}/${triggerType}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  async rerunRun(runId: string, mode: 'full' | 'resume'): Promise<void> {
    const { run, actions, resumeFromStep, previousOutput } = await this.automation.createRetryRun(
      runId,
      mode
    );
    await this.executeRun(
      run.id,
      actions,
      run.input,
      run.triggerType,
      resumeFromStep,
      previousOutput
    );
  }

  async runManual(
    automationId: string,
    payload: Record<string, unknown>
  ): Promise<{ id: string; status: string }> {
    const { run, actions } = await this.automation.triggerWithActions(automationId, {
      triggerType: 'button_clicked',
      payload,
    });
    if (run.status === 'pending') {
      await this.executeRun(run.id, actions, payload, 'button_clicked');
    }
    const finished = await this.automation.getRun(run.id);
    return { id: run.id, status: finished?.status ?? run.status };
  }

  private async dispatchEvent(
    triggerType:
      | 'record_created'
      | 'record_updated'
      | 'record_deleted'
      | 'button_clicked'
      | 'form_submitted',
    payload: Record<string, unknown>,
    userId?: string
  ): Promise<void> {
    try {
      const tableId = typeof payload.tableId === 'string' ? payload.tableId : undefined;
      if (!tableId) return;
      const runs = await this.automation.triggerRecordEvent({
        tableId,
        triggerType,
        payload,
        userId,
      });
      for (const { run, actions } of runs) {
        await this.executeRun(run.id, actions, payload, triggerType);
      }
      if (runs.length > 0) {
        this.logger.log(
          `automation event dispatched: table=${tableId} trigger=${triggerType} count=${runs.length}`
        );
      }
    } catch (error) {
      this.logger.error(
        `automation event failed: table=${String(payload.tableId)} trigger=${triggerType}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private getTriggerType(
    event: RecordCreateEvent | RecordUpdateEvent | RecordDeleteEvent
  ): 'record_created' | 'record_updated' | 'record_deleted' {
    if (event.name === Events.TABLE_RECORD_CREATE) return 'record_created';
    if (event.name === Events.TABLE_RECORD_UPDATE) return 'record_updated';
    return 'record_deleted';
  }

  private async executeRun(
    runId: string,
    actions: Array<{ type: string; orderIndex: number; config: Record<string, unknown> }>,
    payload: Record<string, unknown>,
    triggerType: string,
    startIndex = 0,
    previousOutput?: unknown
  ): Promise<void> {
    await this.automation.finishRun(runId, { status: 'running' });
    let failed = false;
    const steps: Array<Record<string, unknown>> = [];
    let actionPayload =
      previousOutput === undefined ? payload : { ...payload, previousAction: previousOutput };
    const secrets =
      typeof this.automation.resolveSecretsForRun === 'function'
        ? await this.automation.resolveSecretsForRun(runId).catch(() => ({}))
        : {};
    const baseId =
      typeof this.automation.getBaseIdForRun === 'function'
        ? await this.automation.getBaseIdForRun(runId).catch(() => null)
        : null;
    const sortedActions = actions.slice().sort((left, right) => left.orderIndex - right.orderIndex);
    for (const [index, action] of sortedActions.entries()) {
      if (index < startIndex) continue;
      const startedAt = new Date();
      const result = await this.executeAction(
        runId,
        {
          ...action,
          config: this.resolveSecretReferences(action.config, secrets) as Record<string, unknown>,
        },
        actionPayload,
        baseId
      );
      steps.push({
        index,
        actionType: action.type,
        input: this.compactOutput(this.redactSecretValues(actionPayload, secrets)),
        status: result.failed ? 'failed' : 'succeeded',
        output: this.compactOutput(this.redactSecretValues(result.output, secrets)),
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      });
      if (result.output !== undefined) {
        actionPayload = { ...actionPayload, previousAction: result.output };
      }
      failed = result.failed;
      if (failed) break;
    }
    await this.automation.finishRun(runId, {
      status: failed ? 'failed' : 'succeeded',
      output: { actionCount: actions.length, trigger: triggerType, steps },
    });
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private async executeAction(
    runId: string,
    action: { type: string; config: Record<string, unknown> },
    payload: Record<string, unknown>,
    baseId: string | null,
    depth = 0
  ): Promise<IActionResult> {
    if (depth > 8) {
      await this.failRun(runId, 'conditional_logic nesting exceeds the maximum depth');
      return { failed: true };
    }
    if (action.type === 'create_record') {
      return this.executeCreateRecord(runId, action.config, payload);
    }
    if (action.type === 'get_records') {
      return this.executeGetRecords(runId, action.config, payload);
    }
    if (action.type === 'http_request') {
      return this.executeHttpRequest(runId, action.config, payload);
    }
    if (action.type === 'webhook' || action.type === 'call_webhook') {
      const result = await this.webhook.dispatch({
        runId,
        config: action.config as never,
        payload:
          action.type === 'call_webhook' && this.asObject(action.config.payload)
            ? (action.config.payload as Record<string, unknown>)
            : payload,
      });
      return { failed: !result.delivered, output: result };
    }
    if (['slack', 'discord', 'telegram', 'teams'].includes(action.type)) {
      const result = await this.imBridge.dispatch({
        runId,
        provider: action.type as never,
        config: action.config as never,
      });
      return { failed: !result.delivered, output: result };
    }
    if (action.type === 'update_record') {
      return this.executeUpdateRecord(runId, action.config, payload);
    }
    if (action.type === 'conditional_logic') {
      return this.executeConditionalLogic(runId, action.config, payload, baseId, depth);
    }
    if (action.type === 'ai_generate' || action.type === 'ai_prompt') {
      return this.executeAiGenerate(
        runId,
        {
          ...action.config,
          ...(action.type === 'ai_prompt' && action.config.model
            ? { modelKey: action.config.model }
            : {}),
        },
        payload,
        baseId
      );
    }
    if (action.type === 'email' || action.type === 'send_email') {
      return this.executeEmail(runId, action.config, baseId);
    }
    if (action.type === 'notify_user') {
      return this.executeNotifyUser(runId, action.config);
    }
    if (action.type === 'send_teams_message') {
      return this.executeTeamsMessage(runId, action.config);
    }
    if (action.type === 'run_script') {
      return this.executeRunScript(runId, action.config, payload);
    }
    await this.failRun(runId, `automation action ${action.type} is not implemented`);
    return { failed: true };
  }

  private async executeConditionalLogic(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    baseId: string | null,
    depth: number
  ): Promise<IActionResult> {
    const condition = this.evaluateConditionGroup(config, payload);
    const branchName = condition ? 'true' : 'false';
    const branch = this.asActionList(
      condition
        ? config.ifTrue ?? config.then ?? config.true
        : config.ifFalse ?? config.else ?? config.false
    );
    const outputs: unknown[] = [];
    let branchPayload = payload;
    for (const [index, nested] of branch.entries()) {
      const result = await this.executeAction(runId, nested, branchPayload, baseId, depth + 1);
      outputs.push({ index, type: nested.type, failed: result.failed, output: result.output });
      if (result.output !== undefined) {
        branchPayload = { ...branchPayload, previousAction: result.output };
      }
      if (result.failed) {
        return {
          failed: true,
          output: { matched: condition, branch: branchName, actions: outputs },
        };
      }
    }
    return { failed: false, output: { matched: condition, branch: branchName, actions: outputs } };
  }

  private async executeAiGenerate(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    baseId: string | null
  ): Promise<IActionResult> {
    const prompt = this.asString(config.prompt);
    if (!prompt || !baseId || !this.aiService) {
      await this.failRun(runId, 'ai_generate requires prompt and a base');
      return { failed: true };
    }
    try {
      const resolvedPrompt = this.interpolateTemplate(prompt, payload);
      const text = await this.aiService.generateText(baseId, {
        prompt: resolvedPrompt,
        ...(this.asString(config.modelKey) ? { modelKey: this.asString(config.modelKey) } : {}),
      });
      const outputType = config.outputType === 'json' ? 'json' : 'text';
      if (outputType === 'json') {
        try {
          return { failed: false, output: JSON.parse(text) };
        } catch {
          await this.failRun(runId, 'ai_generate returned invalid JSON');
          return { failed: true };
        }
      }
      return { failed: false, output: { text } };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private evaluateConditionGroup(
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): boolean {
    const group = this.asObject(config.condition) ?? config;
    const conditions = Array.isArray(group.conditions)
      ? group.conditions.filter((item): item is IAutomationCondition => this.isCondition(item))
      : [];
    const nested = Array.isArray(group.groups)
      ? group.groups.filter((item): item is Record<string, unknown> => Boolean(this.asObject(item)))
      : [];
    const results = [
      ...conditions.map((condition) => this.evaluateCondition(condition, payload)),
      ...nested.map((child) => this.evaluateConditionGroup(child, payload)),
    ];
    if (results.length === 0) return false;
    const mode = group.mode === 'any' || group.operator === 'or' ? 'any' : 'all';
    const matched = mode === 'any' ? results.some(Boolean) : results.every(Boolean);
    return group.negate === true || group.operator === 'not' ? !matched : matched;
  }

  private evaluateCondition(
    condition: IAutomationCondition,
    payload: Record<string, unknown>
  ): boolean {
    const record = Array.isArray(payload.record) ? payload.record[0] : payload.record;
    const recordObject = this.asObject(record);
    const fields = this.asObject(recordObject?.fields) ?? this.asObject(payload.fields) ?? payload;
    const candidate = fields[condition.fieldId];
    const actual = this.asObject(candidate);
    const value =
      actual && ('newValue' in actual || 'oldValue' in actual) ? actual.newValue : candidate;
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'contains':
        return String(value ?? '').includes(String(condition.value ?? ''));
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'is_empty':
        return value === null || value === undefined || value === '';
      case 'is_not_empty':
        return value !== null && value !== undefined && value !== '';
      default:
        return false;
    }
  }

  private isCondition(value: unknown): value is IAutomationCondition {
    const condition = this.asObject(value);
    return Boolean(
      condition && typeof condition.fieldId === 'string' && typeof condition.operator === 'string'
    );
  }

  private asActionList(value: unknown): Array<{ type: string; config: Record<string, unknown> }> {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => Boolean(this.asObject(item)))
      .map((item) => ({
        type: typeof item.type === 'string' ? item.type : '',
        config: this.asObject(item.config) ?? {},
      }))
      .filter((action) => action.type.length > 0);
  }

  private async executeCreateRecord(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<IActionResult> {
    const tableId = this.asString(config.tableId) ?? this.asString(payload.tableId);
    const fields = this.asObject(config.fields);
    if (!tableId || !fields) {
      await this.failRun(runId, 'create_record requires tableId and fields');
      return { failed: true };
    }
    try {
      const input: ICreateRecordsRo = {
        fieldKeyType:
          this.asString(config.fieldKeyType) === 'name' ? FieldKeyType.Name : FieldKeyType.Id,
        typecast: config.typecast === true,
        records: [{ fields: fields as never }],
      };
      const result = await this.recordOpenApi.createRecords(tableId, input);
      return { failed: false, output: result };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async executeGetRecords(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<IActionResult> {
    const tableId = this.asString(config.tableId) ?? this.asString(payload.tableId);
    if (!tableId) {
      await this.failRun(runId, 'get_records requires tableId');
      return { failed: true };
    }
    try {
      const result = await this.recordOpenApi.getRecords(
        tableId,
        (this.asObject(config.query) ?? {}) as IGetRecordsRo
      );
      return { failed: false, output: result };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async executeHttpRequest(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<IActionResult> {
    const url = this.asString(config.url);
    if (!url || !/^https?:\/\//.test(url)) {
      await this.failRun(runId, 'http_request requires an http(s) url');
      return { failed: true };
    }
    try {
      const body = config.body === undefined ? payload : config.body;
      const response = await safeFetch(url, {
        method: this.asString(config.method)?.toUpperCase() ?? 'POST',
        headers: {
          ['content-type']: 'application/json',
          ...this.asStringMap(config.headers),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      if (!response.ok) {
        await this.failRun(runId, `http_request returned ${response.status}`);
        return { failed: true };
      }
      return { failed: false, output: { status: response.status } };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async executeUpdateRecord(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<IActionResult> {
    const record = Array.isArray(payload.record) ? payload.record[0] : payload.record;
    const recordData = this.asRecord(record);
    const tableId = this.asString(config.tableId) ?? this.asString(payload.tableId);
    const recordId = this.asString(config.recordId) ?? this.asString(recordData?.id);
    const fields = this.asObject(config.fields);
    if (!tableId || !recordId || !fields) {
      await this.failRun(runId, 'update_record requires tableId, recordId, and fields');
      return { failed: true };
    }
    try {
      const update: IUpdateRecordRo = {
        fieldKeyType:
          this.asString(config.fieldKeyType) === 'name' ? FieldKeyType.Name : FieldKeyType.Id,
        typecast: config.typecast === true,
        record: { fields: fields as never },
      };
      const result = await this.recordOpenApi.updateRecord(tableId, recordId, update);
      return { failed: false, output: result };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async executeEmail(
    runId: string,
    config: Record<string, unknown>,
    baseId: string | null
  ): Promise<IActionResult> {
    const to = this.asStringOrStrings(config.to);
    const subject = this.asString(config.subject);
    if (!to || !subject) {
      await this.failRun(runId, 'email requires to and subject');
      return { failed: true };
    }
    if (baseId && this.rateLimit && !this.rateLimit.consume(baseId, runId, 'email')) {
      await this.failRun(runId, 'email sending rate limit exceeded');
      return { failed: true };
    }
    const delivered = await this.mailSender.sendMail({
      to,
      subject,
      text: this.asString(config.text) ?? this.asString(config.body),
      html: this.asString(config.html),
    });
    if (!delivered) {
      await this.failRun(runId, 'email delivery failed');
    }
    return { failed: !delivered, output: { delivered } };
  }

  private async executeNotifyUser(
    runId: string,
    config: Record<string, unknown>
  ): Promise<IActionResult> {
    const message = this.asString(config.message);
    const userId = this.asString(config.userId);
    const email = this.asString(config.toEmail);
    if (!message || (!userId && !email) || !this.notificationService) {
      await this.failRun(runId, 'notify_user requires message and a configured recipient');
      return { failed: true };
    }
    try {
      const result = await this.notificationService.sendCommonNotify({
        ...(userId ? { toUserId: userId } : {}),
        ...(email ? { toEmail: email } : {}),
        message,
        ...(this.asString(config.path) ? { path: this.asString(config.path) } : {}),
      });
      if (result.sentCount === 0) {
        await this.failRun(runId, 'notify_user recipient was not found');
        return { failed: true, output: result };
      }
      return { failed: false, output: result };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async executeTeamsMessage(
    runId: string,
    config: Record<string, unknown>
  ): Promise<IActionResult> {
    const text = this.asString(config.text);
    if (!text || !this.teamsAdapter) {
      await this.failRun(runId, 'send_teams_message requires text and Teams support');
      return { failed: true };
    }
    const result = await this.teamsAdapter.sendMessage(
      { webhookUrl: config.webhookUrl },
      {
        text,
        ...(this.asString(config.title) ? { title: this.asString(config.title) } : {}),
        ...(Array.isArray(config.fields) ? { fields: config.fields as never } : {}),
      }
    );
    if (!result.delivered) await this.failRun(runId, result.error);
    return { failed: !result.delivered, output: result };
  }

  private async executeRunScript(
    runId: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>
  ): Promise<IActionResult> {
    const script = this.asString(config.script);
    if (!script) {
      await this.failRun(runId, 'run_script requires script');
      return { failed: true };
    }
    try {
      const sandbox = {
        input: payload,
        env: this.asStringMap(config.env),
        process: { env: this.asStringMap(config.env) },
        result: undefined as unknown,
      };
      vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
      new vm.Script(`result = (function() {${script}\n})()`).runInContext(sandbox, {
        timeout: Math.min(Math.max(Number(config.timeoutMs) || 1000, 50), 5000),
      });
      return { failed: false, output: sandbox.result };
    } catch (error) {
      await this.failRun(runId, this.errorMessage(error));
      return { failed: true };
    }
  }

  private async failRun(runId: string, error: string): Promise<void> {
    await this.automation.finishRun(runId, { status: 'failed', error });
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asStringOrStrings(value: unknown): string | string[] | undefined {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())) {
      return value as string[];
    }
    return undefined;
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asStringMap(value: unknown): Record<string, string> {
    const object = this.asObject(value);
    if (!object) return {};
    return Object.fromEntries(
      Object.entries(object).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  }

  private interpolateTemplate(template: string, payload: Record<string, unknown>): string {
    return template.replace(/\{\{([^{}]+)\}\}/g, (_match, path: string) => {
      const value = path
        .trim()
        .split('.')
        .reduce<unknown>((current, key) => this.asObject(current)?.[key], payload);
      return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return this.asObject(value);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private compactOutput(value: unknown): unknown {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') return value.slice(0, 20_000);
    try {
      return JSON.parse(JSON.stringify(value).slice(0, 20_000));
    } catch {
      return '[unserializable output]';
    }
  }

  private redactSecretValues(value: unknown, secrets: Record<string, string>): unknown {
    if (typeof value === 'string') {
      return Object.values(secrets).reduce(
        (current, secret) => (secret ? current.split(secret).join('[REDACTED]') : current),
        value
      );
    }
    if (Array.isArray(value)) return value.map((item) => this.redactSecretValues(item, secrets));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          this.redactSecretValues(nested, secrets),
        ])
      );
    }
    return value;
  }

  private resolveSecretReferences(value: unknown, secrets: Record<string, string>): unknown {
    if (typeof value === 'string') {
      const exact = /^\{\{secrets\.([A-Z][A-Z0-9_]*)\}\}$/.exec(value);
      if (exact) return secrets[exact[1]] ?? value;
      return value.replace(
        /\{\{secrets\.([A-Z][A-Z0-9_]*)\}\}/g,
        (_, name: string) => secrets[name] ?? ''
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveSecretReferences(item, secrets));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          this.resolveSecretReferences(nested, secrets),
        ])
      );
    }
    return value;
  }
}
