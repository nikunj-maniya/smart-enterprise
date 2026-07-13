import { z } from 'zod';
import { collectRuleFields, visibilityRuleSchema } from './rules.js';

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
  'date-multi',
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
  label: z.string().min(1, 'Label is required'),
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

// ── Approval routing (mirrors `ApprovalWorkflow.stageRules`) — PRD §6/§9 ──
// A `StageRules.approvers` entry names where one parallel-stage approver comes
// from; the request-creation snapshot resolves each rule against the submitted
// payload into `RequestApprover` rows. Only the `field` source (a user-picker
// field's submitted value(s)) is implemented today — role-based routing is a
// later slice (design.md).
export const approverRuleSchema = z.object({
  source: z.literal('field'),
  /** The user-picker field whose submitted value(s) resolve to approver user id(s). */
  field: z.string().min(1),
  /** Optional gate: this stage only applies when the rule matches the submitted payload. */
  when: visibilityRuleSchema.optional(),
});
export type ApproverRule = z.infer<typeof approverRuleSchema>;

export const stageRulesSchema = z.object({
  approvers: z.array(approverRuleSchema),
});
export type StageRules = z.infer<typeof stageRulesSchema>;

/** Field types a `field`-sourced approver rule may resolve approver user id(s) from. */
const PICKER_FIELD_TYPES: ReadonlySet<FieldType> = new Set(['user-picker', 'project-picker']);
export function isPickerFieldType(type: FieldType): boolean {
  return PICKER_FIELD_TYPES.has(type);
}

/**
 * Validate a form's stage rules against its own field set: every `field`-sourced approver rule
 * must reference a field that exists on the form and is a picker type (user-picker/project-picker)
 * — anything else can't resolve to approver user id(s) at submission time (PRD §6/§9). Every field
 * named in a rule's optional `when` gate must also exist on the form, or the gate would silently
 * stop matching once that field is gone. Returns one message per offending rule; an empty array
 * means the stage rules are valid. Kept separate from `stageRulesSchema` because the check needs
 * the form's field set, which the rules don't carry.
 */
export function validateStageRules(
  stageRules: StageRules,
  fields: Pick<FormField, 'key' | 'type'>[],
): string[] {
  const typeByKey = new Map(fields.map((f) => [f.key, f.type]));
  const errors: string[] = [];
  for (const rule of stageRules.approvers) {
    const type = typeByKey.get(rule.field);
    if (type === undefined) {
      errors.push(`Approver field "${rule.field}" is not on this form`);
    } else if (!isPickerFieldType(type)) {
      errors.push(`Approver field "${rule.field}" must be a user-picker or project-picker field`);
    }
    if (rule.when) {
      for (const gateKey of collectRuleFields(rule.when.when)) {
        if (!typeByKey.has(gateKey)) {
          errors.push(`Approver field "${rule.field}"'s visibility gate references field "${gateKey}", which is not on this form`);
        }
      }
    }
  }
  return errors;
}

/**
 * Guardrail for editing a core form's (Leave, WFH, Visitor, IT) fields in the builder
 * (form-builder spec, "Core forms editable within metadata bounds"): relabeling, reordering, and
 * required/validation/visibility-rule edits are allowed on a field that's still present (same key
 * + type), but the field *set* itself may not change shape — adding a field, removing a field, or
 * changing an existing field's type all require a new field type/engineering change and are
 * rejected. Routing edits are validated separately by `validateStageRules`. Returns one message per
 * offending field; an empty array means the edit is allowed. Mirrors `validateStageRules`'s shape.
 */
export function validateCoreFormFieldEdit(
  before: Pick<FormField, 'key' | 'type'>[],
  after: Pick<FormField, 'key' | 'type'>[],
): string[] {
  const beforeByKey = new Map(before.map((f) => [f.key, f.type]));
  const afterByKey = new Map(after.map((f) => [f.key, f.type]));
  const errors: string[] = [];

  for (const key of afterByKey.keys()) {
    if (!beforeByKey.has(key)) errors.push(`Field "${key}" cannot be added to a core form`);
  }
  for (const [key, type] of beforeByKey) {
    if (!afterByKey.has(key)) {
      errors.push(`Field "${key}" cannot be removed from a core form`);
    } else if (afterByKey.get(key) !== type) {
      errors.push(`Field "${key}"'s type cannot be changed on a core form`);
    }
  }
  return errors;
}

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
