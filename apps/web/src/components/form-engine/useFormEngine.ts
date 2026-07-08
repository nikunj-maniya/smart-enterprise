import * as React from 'react';
import {
  isEmptyValue,
  isFieldVisible,
  validatePayload,
  type FormDefinition,
  type FormField,
  type FormSection,
  type RequestDto,
} from '@se/shared';
import { ApiError, submitRequest } from '@/lib/api';

/** A definition section narrowed to its currently-visible fields, keyed by its stable position in the definition. */
export interface VisibleSection {
  key: number;
  section: FormSection;
  fields: FormField[];
}

export interface UseFormEngineResult {
  /** Current field values, keyed by field key. */
  values: Record<string, unknown>;
  /** Validation errors per field key — empty until `validate()` runs, or set via `setErrors`. */
  errors: Record<string, string[]>;
  /** Sections in declared order, filtered to those whose visibility rule currently passes, each carrying only its currently-visible fields. */
  sections: VisibleSection[];
  /** Sets a single field's value. */
  setValue: (key: string, value: unknown) => void;
  /** Runs the shared `validatePayload` against the current values, updates `errors`, and returns whether it passed. */
  validate: () => boolean;
  /** Replaces the error map wholesale (e.g. to apply server-side per-field errors on submit — Slice 8/5.4). */
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  /**
   * Validates, then submits the values of only the currently-visible fields to
   * `POST /requests`. Returns `null` (with `errors` populated) on a client-side
   * validation failure or a server 400 with a per-field `details` map; any other
   * failure (network, 403, 500, ...) rethrows for the caller to surface generically.
   */
  submit: () => Promise<RequestDto | null>;
}

/**
 * Drives a published `FormDefinition`'s live state (PRD §6.4, core-renderer spec):
 * ordered/visible sections and per-field visibility, clearing a field's value the
 * moment it drops out of the visible set so it never lingers in state or the
 * submitted payload. Validation reuses `validatePayload` — the SAME function the
 * server re-runs on submit — so client and server always agree.
 */
export function useFormEngine(
  definition: FormDefinition,
  initialValues: Record<string, unknown> = {},
): UseFormEngineResult {
  const [values, setValues] = React.useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const setValue = React.useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const sections = React.useMemo<VisibleSection[]>(
    () =>
      definition.sections
        .map((section, key) => ({ key, section }))
        .filter(({ section }) => isFieldVisible(section.visibilityRule, values))
        .map(({ key, section }) => ({
          key,
          section,
          fields: section.fields.filter((field) => isFieldVisible(field.visibilityRule, values)),
        })),
    [definition, values],
  );

  // Hidden ⇒ absent: clear a field's value (and any error) the moment it drops out
  // of the visible set, so a re-hidden field never lingers in the submitted payload.
  React.useEffect(() => {
    const visibleKeys = new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
    const staleKeys = Object.keys(values).filter((key) => !visibleKeys.has(key) && !isEmptyValue(values[key]));
    if (staleKeys.length === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const key of staleKeys) delete next[key];
      return next;
    });
    setErrors((prev) => {
      if (!staleKeys.some((key) => prev[key])) return prev;
      const next = { ...prev };
      for (const key of staleKeys) delete next[key];
      return next;
    });
  }, [sections, values]);

  const validate = React.useCallback(() => {
    const result = validatePayload(definition, values);
    setErrors(result.errors ?? {});
    return result.success;
  }, [definition, values]);

  const submit = React.useCallback(async (): Promise<RequestDto | null> => {
    if (!validate()) return null;

    // Build the payload from only the currently-visible fields — a hidden field's
    // value must never reach the server, matching the hidden⇒absent contract.
    const payload: Record<string, unknown> = {};
    for (const { fields } of sections) {
      for (const field of fields) {
        if (field.key in values) payload[field.key] = values[field.key];
      }
    }

    try {
      return await submitRequest(definition.key, payload);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.details) {
        setErrors(err.details);
        return null;
      }
      throw err;
    }
  }, [definition.key, sections, values, validate]);

  return { values, errors, sections, setValue, validate, setErrors, submit };
}
