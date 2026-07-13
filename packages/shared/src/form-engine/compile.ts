import { z } from 'zod';
import { isEmptyValue, isFieldVisible, type VisibilityRule } from './rules.js';
import {
  asOptionList,
  asPickerConfig,
  isLayoutField,
  isStubField,
  type FieldValidation,
  type FormDefinition,
  type FormField,
} from './metadata.js';

// ── Metadata → Zod compiler (PRD §6, design.md) ───────────────
// Requiredness and visibility depend on the payload, so only the STATIC parts —
// each field's base value schema (type + intrinsic validation) and its
// descriptors — are compiled and cached per `(definitionId, version)`. The
// payload-specific object shape (which fields are visible / required) is
// assembled per `validatePayload` call.

interface CompiledField {
  field: FormField;
  sectionRule?: VisibilityRule;
  /** Base value schema for a present value; `null` for layout-only fields. */
  schema: z.ZodTypeAny | null;
}

interface CompiledDefinition {
  key: string;
  version: number;
  fields: CompiledField[];
}

const cache = new Map<string, CompiledDefinition>();

function cacheKey(def: FormDefinition): string {
  return `${def.id}:${def.version}`;
}

function buildStringSchema(validation?: FieldValidation): z.ZodString {
  let schema = z.string();
  if (validation?.minLength !== undefined) schema = schema.min(validation.minLength);
  if (validation?.maxLength !== undefined) schema = schema.max(validation.maxLength);
  return schema;
}

/** Base schema validating a present (non-empty) value for a field. */
function buildFieldSchema(field: FormField): z.ZodTypeAny | null {
  const { type, validation, options } = field;
  if (isLayoutField(type)) return null;

  switch (type) {
    case 'number': {
      let schema = z.number();
      if (validation?.min !== undefined) schema = schema.min(validation.min);
      if (validation?.max !== undefined) schema = schema.max(validation.max);
      return schema;
    }
    case 'checkbox':
    case 'consent-link':
      return z.boolean();
    case 'date-multi':
      // Specific half-day dates within a leave/WFH range (reporting-and-polish: upgrades the
      // v1 half-day count field) — a plain array of ISO date strings at the generic level; the
      // leave/WFH-specific "must fall within [start_date, end_date]" rule is re-checked
      // server-side in `leave-wfh-rules.ts`, the same pattern as the HR-signoff rule.
      return z.array(z.string().min(1));
    case 'daterange': {
      const schema = z.object({ start: z.string().min(1), end: z.string().min(1) });
      if (validation?.dateOrder === true) {
        return schema.refine((v) => v.end >= v.start, {
          message: 'End date must be on or after the start date',
        });
      }
      return schema;
    }
    case 'multi-select':
    case 'checkbox-group': {
      const opts = asOptionList(options);
      if (opts) {
        const allowed = new Set(opts.map((o) => o.value));
        return z.array(z.string().refine((v) => allowed.has(v), { message: 'Invalid option' }));
      }
      return z.array(z.string());
    }
    case 'single-select':
    case 'radio': {
      const opts = asOptionList(options);
      const base = buildStringSchema(validation);
      if (opts) {
        const allowed = new Set(opts.map((o) => o.value));
        return base.refine((v) => allowed.has(v), { message: 'Invalid option' });
      }
      return base;
    }
    case 'user-picker':
    case 'project-picker': {
      // Directory membership resolves server-side later; here we only shape
      // single (string) vs multi (string[]) from the picker config.
      const multi = asPickerConfig(options)?.multi ?? false;
      return multi ? z.array(z.string()) : z.string();
    }
    case 'signature':
    case 'file-upload':
      // Object storage lands in Phase 4 — accept an optional string stub.
      return z.string();
    // text, textarea, date, datetime, time
    default:
      return buildStringSchema(validation);
  }
}

/** Compile a definition version's static parts, memoised per `(id, version)`. */
export function compileDefinition(def: FormDefinition): CompiledDefinition {
  const key = cacheKey(def);
  const cached = cache.get(key);
  if (cached) return cached;

  const fields: CompiledField[] = [];
  for (const section of def.sections) {
    for (const field of section.fields) {
      fields.push({
        field,
        sectionRule: section.visibilityRule,
        schema: buildFieldSchema(field),
      });
    }
  }
  const compiled: CompiledDefinition = { key: def.key, version: def.version, fields };
  cache.set(key, compiled);
  return compiled;
}

/** Clear the compile cache (test/dev helper). */
export function clearCompileCache(): void {
  cache.clear();
}

export interface ValidationResult {
  success: boolean;
  /** Present only on success: the validated, visible-field payload. */
  data?: Record<string, unknown>;
  /** Present only on failure: error messages keyed by field key. */
  errors?: Record<string, string[]>;
}

/**
 * Validate a payload against a definition version — types, option membership,
 * validation rules, conditional requiredness, and the hidden⇒absent contract.
 * The SAME function the renderer calls for live validation and the server calls
 * to authoritatively re-validate a submission.
 */
export function validatePayload(def: FormDefinition, payload: Record<string, unknown>): ValidationResult {
  const compiled = compileDefinition(def);
  const errors: Record<string, string[]> = {};
  const data: Record<string, unknown> = {};

  const addError = (key: string, message: string) => {
    (errors[key] ??= []).push(message);
  };

  for (const { field, sectionRule, schema } of compiled.fields) {
    if (schema === null) continue; // layout field, no value
    const key = field.key;
    const value = payload[key];
    const hasValue = !isEmptyValue(value);
    const visible = isFieldVisible(sectionRule, payload) && isFieldVisible(field.visibilityRule, payload);

    // Hidden ⇒ absent: a value for a hidden field is a validation error.
    if (!visible) {
      if (hasValue) addError(key, 'This field is not applicable and must not be submitted');
      continue;
    }

    const stub = isStubField(field.type);

    // Conditional requiredness (stubs are never required — object storage is later).
    if (field.required && !stub) {
      if (field.type === 'consent-link') {
        if (value !== true) addError(key, 'This field is required');
      } else if (!hasValue) {
        addError(key, 'This field is required');
      }
    }

    if (hasValue) {
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        data[key] = parsed.data;
      } else {
        for (const issue of parsed.error.issues) addError(key, issue.message);
      }
    }
  }

  // Cross-field date ordering: a `date` field whose value must be ≥ another field's.
  for (const { field, sectionRule } of compiled.fields) {
    const order = field.validation?.dateOrder;
    if (!order || typeof order === 'boolean') continue;
    const visible = isFieldVisible(sectionRule, payload) && isFieldVisible(field.visibilityRule, payload);
    if (!visible) continue;
    const value = payload[field.key];
    const after = payload[order.afterField];
    if (isEmptyValue(value) || isEmptyValue(after)) continue;
    if (typeof value === 'string' && typeof after === 'string' && value < after) {
      addError(field.key, `Must be on or after ${order.afterField}`);
    }
  }

  const success = Object.keys(errors).length === 0;
  return success ? { success, data } : { success, errors };
}
