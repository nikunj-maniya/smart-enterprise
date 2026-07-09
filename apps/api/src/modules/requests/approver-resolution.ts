import { asPickerConfig, isFieldVisible, type FormDefinition, type FormField, type StageRules } from '@se/shared';

// ── Approver snapshot resolution (design.md decision: "field" source only) ──
// Turns a form's `ApprovalWorkflow.stageRules` into the concrete `RequestApprover`
// rows to snapshot at submission: each stage names a user-picker field whose
// submitted value(s) are the stage's approver id(s), gated by an optional `when`
// rule evaluated against the same validated payload.

export interface ResolvedApprover {
  approverId: string;
  roleContext: string;
}

function findField(definition: FormDefinition, key: string): FormField | undefined {
  for (const section of definition.sections) {
    const field = section.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/** A single-role-restricted picker names that role; otherwise the field key itself identifies the stage. */
function roleContextFor(field: FormField | undefined, fieldKey: string): string {
  const roles = field ? asPickerConfig(field.options)?.roles : undefined;
  return roles && roles.length === 1 ? roles[0] : fieldKey;
}

/**
 * Resolve `stageRules` against a validated submission payload into the approver
 * (user id, role context) pairs to snapshot. Stages whose `when` gate doesn't match
 * are skipped; an unset/empty picker value contributes no approver. Duplicate
 * (approverId, roleContext) pairs collapse to one row.
 */
export function resolveApprovers(
  definition: FormDefinition,
  stageRules: StageRules | null | undefined,
  payload: Record<string, unknown>,
): ResolvedApprover[] {
  if (!stageRules) return [];

  const resolved: ResolvedApprover[] = [];
  const seen = new Set<string>();

  for (const rule of stageRules.approvers) {
    if (!isFieldVisible(rule.when, payload)) continue;

    const roleContext = roleContextFor(findField(definition, rule.field), rule.field);
    const value = payload[rule.field];
    const ids = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];

    for (const id of ids) {
      if (typeof id !== 'string' || id === '') continue;
      const dedupeKey = `${id}:${roleContext}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      resolved.push({ approverId: id, roleContext });
    }
  }

  return resolved;
}
