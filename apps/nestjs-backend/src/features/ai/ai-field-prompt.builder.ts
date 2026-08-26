/**
 * AI field prompt builder — Round 11 T-11.
 *
 * Pure helpers that translate an `IFieldAIConfig` + source-field cell values
 * into a single string suitable for `AiService.generateText({ prompt })`.
 *
 * Kept dependency-free (no Prisma, no Nest DI) so it can be unit-tested in
 * isolation and reused by both the field-create listener and the auto-fill
 * controller. The schema shapes are sourced from `@teable/core`'s
 * `fieldAIConfigSchema` discriminated union — `FieldAIActionType`.
 */
import type { IFieldAIConfig } from '@teable/core';
import { FieldAIActionType } from '@teable/core';

const FIELD_REF_PATTERN = /\{\s*([A-Za-z_][\w-]*)\s*\}/g;

/**
 * Replace `{fieldId}` placeholders inside a prompt template with the
 * stringified value of the referenced source field.
 */
export function renderPromptTemplate(
  template: string,
  fieldValueById: Readonly<Record<string, string>>
): string {
  return template.replace(FIELD_REF_PATTERN, (_match, rawId: string) => {
    if (Object.prototype.hasOwnProperty.call(fieldValueById, rawId)) {
      return fieldValueById[rawId] ?? '';
    }
    return `{${rawId}}`;
  });
}

/**
 * Default English prompt template for a `Customization` config that omits a
 * prompt. Mirrors the cloud prompt convention so the OSS build still feels
 * native when an admin skips the prompt field.
 */
const DEFAULT_CUSTOMIZATION_PROMPT = 'Use the input to produce a useful value.';

interface IBuildArgs {
  config: IFieldAIConfig;
  fieldValueById: Readonly<Record<string, string>>;
  /** Field name lookup so default templates can refer to sources by name. */
  fieldNameById?: Readonly<Record<string, string>>;
}

function readSourceText(
  config: IFieldAIConfig,
  fieldValueById: Readonly<Record<string, string>>
): string {
  if ('sourceFieldId' in config && typeof config.sourceFieldId === 'string') {
    return fieldValueById[config.sourceFieldId] ?? '';
  }
  // Field-level custom prompts that reference {fieldId}; concatenate all
  // referenced source values into a single block.
  const values = Object.values(fieldValueById);
  return values.join('\n');
}

/**
 * Build a final prompt from an AI field's config + the stringified values of
 * its source fields. Returns `null` when the config is missing or the source
 * text is empty — callers should treat null as "skip this field for this row".
 */
export function buildAiFieldPrompt(args: IBuildArgs): string | null {
  const { config, fieldValueById } = args;
  if (!config) return null;

  switch (config.type) {
    case FieldAIActionType.Summary: {
      const source = readSourceText(config, fieldValueById).trim();
      if (!source) return null;
      return `Summarize the following content concisely.\n\nContent:\n${source}`;
    }
    case FieldAIActionType.Translation: {
      const source = readSourceText(config, fieldValueById).trim();
      if (!source) return null;
      const target = config.targetLanguage || 'English';
      return `Translate the following content into ${target}.\n\nContent:\n${source}`;
    }
    case FieldAIActionType.Extraction: {
      const source = readSourceText(config, fieldValueById).trim();
      if (!source) return null;
      return `Extract the key information from the following content as a concise list.\n\nContent:\n${source}`;
    }
    case FieldAIActionType.Improvement: {
      const source = readSourceText(config, fieldValueById).trim();
      if (!source) return null;
      return `Improve the following content while preserving meaning. Output only the improved version.\n\nContent:\n${source}`;
    }
    case FieldAIActionType.Customization: {
      const template = (config.prompt ?? '').trim();
      if (!template) {
        // Fall back to a generic instruction so the model still produces
        // something usable; admin users can override later.
        const values = Object.values(fieldValueById).filter((v) => v && v.length > 0);
        if (values.length === 0) return null;
        return `${DEFAULT_CUSTOMIZATION_PROMPT}\n\nInput:\n${values.join('\n')}`;
      }
      return renderPromptTemplate(template, fieldValueById);
    }
    case FieldAIActionType.Classification:
    case FieldAIActionType.Tag:
    case FieldAIActionType.Rating: {
      const source = readSourceText(config, fieldValueById).trim();
      if (!source) return null;
      return `Classify or rate the following content according to the field configuration.\n\nContent:\n${source}`;
    }
    case FieldAIActionType.ImageGeneration:
    case FieldAIActionType.ImageCustomization: {
      // Image-gen is intentionally out of scope for the OSS record-create
      // auto-fill — providers typically bill per call and we do not want to
      // gate the create flow on a side-effecting image request.
      return null;
    }
    default: {
      // Exhaustiveness guard — new action types should be considered above.
      return null;
    }
  }
}

/**
 * Locate the candidate source-field IDs referenced by an AI config. Used by
 * the record listener to pluck only the cells it needs from the record.
 */
export function collectAiFieldSourceIds(config: IFieldAIConfig): ReadonlyArray<string> {
  if (!config) return [];
  if ('sourceFieldId' in config && typeof config.sourceFieldId === 'string') {
    return [config.sourceFieldId];
  }
  if (config.type === FieldAIActionType.Customization && typeof config.prompt === 'string') {
    const ids = new Set<string>();
    for (const match of config.prompt.matchAll(FIELD_REF_PATTERN)) {
      if (match[1]) ids.add(match[1]);
    }
    return Array.from(ids);
  }
  return [];
}
