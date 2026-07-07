import { z } from 'zod';
import { visibilityRuleSchema } from './rules.js';

// ── Form metadata (mirrors the FormDefinition/Section/Field rows) — PRD §6 ──
// These Zod schemas describe the JSON shapes read out of the `FormDefinition`,
// `FormSection`, and `FormField` tables. `options`/`validation`/`visibilityRule`
// map to the `Json?` columns of those rows.

/** Supported field types — PRD §6.3. Anything else is rejected at parse time. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'time',
  'daterange',
  'single-select',
  'multi-select',
  'radio',
  'checkbox',
  'checkbox-group',
  'user-picker',
  'project-picker',
  'signature',
  'file-upload',
  'consent-link',
  'section',
  'group',
] as const;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** A selectable option for select/radio/checkbox-group fields. */
export const fieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

/**
 * Picker configuration (user-picker / project-picker). Directory options resolve
 * server-side (Slice 2); here we only carry single/multi and the filter hints.
 */
export const pickerConfigSchema = z.object({
  multi: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  /** Non-role option source the picker/engine resolves specially (e.g. project-specific Tech Leads). */
  source: z.string().optional(),
});
export type PickerConfig = z.infer<typeof pickerConfigSchema>;

/** `options` is either a value list (selects) or a picker config (pickers). */
export const fieldOptionsSchema = z.union([z.array(fieldOptionSchema), pickerConfigSchema]);
export type FieldOptions = z.infer<typeof fieldOptionsSchema>;

/**
 * Validation rules — kept minimal but coherent:
 * - `minLength`/`maxLength` on string-valued fields,
 * - `min`/`max` on number fields,
 * - `dateOrder`: `true` on a `daterange` (its `end` ≥ `start`), or
 *   `{ afterField }` on a `date` (this field's value ≥ the referenced field's).
 */
export const fieldValidationSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  dateOrder: z.union([z.boolean(), z.object({ afterField: z.string() })]).optional(),
});
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const formFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  helpText: z.string().optional(),
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  options: fieldOptionsSchema.optional(),
  validation: fieldValidationSchema.optional(),
  visibilityRule: visibilityRuleSchema.optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  visibilityRule: visibilityRuleSchema.optional(),
  fields: z.array(formFieldSchema),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export const formDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  version: z.number().int(),
  renderer: z.enum(['core', 'generic']).default('core'),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  sections: z.array(formSectionSchema),
});
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** Field types that render as disabled stubs until Phase 4 object storage lands. */
const STUB_FIELD_TYPES: ReadonlySet<FieldType> = new Set(['signature', 'file-upload']);
/** Layout-only field types that carry no payload value. */
const LAYOUT_FIELD_TYPES: ReadonlySet<FieldType> = new Set(['section', 'group']);

export function isStubField(type: FieldType): boolean {
  return STUB_FIELD_TYPES.has(type);
}
export function isLayoutField(type: FieldType): boolean {
  return LAYOUT_FIELD_TYPES.has(type);
}

/** Narrow `options` to a value list (selects/radio/checkbox-group). */
export function asOptionList(options: FieldOptions | undefined): FieldOption[] | undefined {
  return Array.isArray(options) ? options : undefined;
}
/** Narrow `options` to a picker config (user-picker/project-picker). */
export function asPickerConfig(options: FieldOptions | undefined): PickerConfig | undefined {
  return options && !Array.isArray(options) ? options : undefined;
}

/**
 * Parse untrusted definition metadata into a typed `FormDefinition`, rejecting
 * unsupported field types with an error that names the offending field (PRD §6.3).
 * Throws on any structural or field-type violation.
 */
export function parseDefinition(input: unknown): FormDefinition {
  const offending = findUnsupportedFieldType(input);
  if (offending) {
    throw new Error(
      `Unsupported field type "${offending.type}" on field "${offending.key}" ` +
        `(allowed: ${FIELD_TYPES.join(', ')})`,
    );
  }
  return formDefinitionSchema.parse(input);
}

function findUnsupportedFieldType(input: unknown): { key: string; type: string } | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const sections = (input as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return undefined;
  const allowed = FIELD_TYPES as readonly string[];
  for (const section of sections) {
    const fields = (section as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const type = (field as { type?: unknown } | null)?.type;
      if (typeof type === 'string' && !allowed.includes(type)) {
        const key = (field as { key?: unknown }).key;
        return { key: typeof key === 'string' ? key : '(unknown)', type };
      }
    }
  }
  return undefined;
}
