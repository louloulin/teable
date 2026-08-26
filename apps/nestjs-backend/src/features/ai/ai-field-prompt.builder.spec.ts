/* eslint-disable @typescript-eslint/naming-convention */
import type { IFieldAIConfig } from '@teable/core';
import { FieldAIActionType } from '@teable/core';
import { describe, expect, it } from 'vitest';
import {
  buildAiFieldPrompt,
  collectAiFieldSourceIds,
  renderPromptTemplate,
} from './ai-field-prompt.builder';

describe('ai-field-prompt.builder', () => {
  describe('renderPromptTemplate', () => {
    it('replaces {fieldId} placeholders with supplied values', () => {
      const out = renderPromptTemplate('Summarize {fldA} into 100 words', {
        fldA: 'Hello world',
      });
      expect(out).toBe('Summarize Hello world into 100 words');
    });

    it('leaves unknown placeholders untouched', () => {
      const out = renderPromptTemplate('Use {fldA} and {fldMissing}', {
        fldA: 'X',
      });
      expect(out).toBe('Use X and {fldMissing}');
    });
  });

  describe('buildAiFieldPrompt', () => {
    it('returns null for missing config', () => {
      expect(buildAiFieldPrompt({ config: null as never, fieldValueById: {} })).toBeNull();
    });

    it('builds a Summary prompt from the sourceFieldId', () => {
      const out = buildAiFieldPrompt({
        config: {
          type: FieldAIActionType.Summary,
          modelKey: 'openai@gpt-4o@custom',
          sourceFieldId: 'fldA',
        },
        fieldValueById: { fldA: 'A long article body.' },
      });
      expect(out).toContain('Summarize');
      expect(out).toContain('A long article body.');
    });

    it('builds a Translation prompt with the target language', () => {
      const out = buildAiFieldPrompt({
        config: {
          type: FieldAIActionType.Translation,
          modelKey: 'openai@gpt-4o@custom',
          sourceFieldId: 'fldA',
          targetLanguage: 'zh',
        },
        fieldValueById: { fldA: 'Hello' },
      });
      expect(out).toContain('zh');
      expect(out).toContain('Hello');
    });

    it('returns null when the source value is empty', () => {
      expect(
        buildAiFieldPrompt({
          config: {
            type: FieldAIActionType.Summary,
            modelKey: 'openai@gpt-4o@custom',
            sourceFieldId: 'fldA',
          },
          fieldValueById: { fldA: '' },
        })
      ).toBeNull();
    });

    it('substitutes multiple placeholders in a Customization prompt', () => {
      const out = buildAiFieldPrompt({
        config: {
          type: FieldAIActionType.Customization,
          modelKey: 'openai@gpt-4o@custom',
          prompt: 'Combine {fldTitle} with {fldBody}',
        },
        fieldValueById: { fldTitle: 'T', fldBody: 'B' },
      });
      expect(out).toBe('Combine T with B');
    });

    it('falls back to a generic prompt when Customization has no template', () => {
      const out = buildAiFieldPrompt({
        config: {
          type: FieldAIActionType.Customization,
          modelKey: 'openai@gpt-4o@custom',
          prompt: '',
        },
        fieldValueById: { fldA: 'some value' },
      });
      expect(out).toContain('some value');
    });

    it('returns null for image-generation action types', () => {
      expect(
        buildAiFieldPrompt({
          config: {
            type: FieldAIActionType.ImageGeneration,
            modelKey: 'openai@gpt-4o@custom',
          } as IFieldAIConfig,
          fieldValueById: {},
        })
      ).toBeNull();
    });
  });

  describe('collectAiFieldSourceIds', () => {
    it('returns sourceFieldId for built-in actions', () => {
      const ids = collectAiFieldSourceIds({
        type: FieldAIActionType.Summary,
        modelKey: 'm',
        sourceFieldId: 'fldA',
      });
      expect(ids).toEqual(['fldA']);
    });

    it('parses placeholders inside Customization prompts', () => {
      const ids = collectAiFieldSourceIds({
        type: FieldAIActionType.Customization,
        modelKey: 'm',
        prompt: 'Combine {fldA} with {fldB} — {fldA}',
      });
      expect([...ids].sort()).toEqual(['fldA', 'fldB']);
    });

    it('returns [] when no source is referenced', () => {
      const ids = collectAiFieldSourceIds({
        type: FieldAIActionType.Customization,
        modelKey: 'm',
        prompt: 'No refs here',
      });
      expect(ids).toEqual([]);
    });
  });
});
