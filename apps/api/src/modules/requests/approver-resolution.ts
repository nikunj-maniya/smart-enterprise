import { asPickerConfig, isFieldVisible, type FormDefinition, type FormField, type StageRules } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

// ── Approver snapshot resolution (design.md decision: "field" source only) ──
// Turns a form's `ApprovalWorkflow.stageRules` into the concrete `RequestApprover`
// rows to snapshot at submission: each stage names a user-picker field whose
// submitted value(s) are the stage's approver id(s), gated by an optional `when`
// rule evaluated against the same validated payload.

export interface ResolvedApprover {
  approverId: string;
  roleContext: string;
  /** The stage's source field key — used by `assertApproversEligible` to look its picker
   *  config back up; optional so callers that rebuild a `ResolvedApprover` after resolution
   *  (e.g. `applySelfApprovalEscalation`) aren't forced to carry it further. */
  fieldKey?: string;
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
      resolved.push({ approverId: id, roleContext, fieldKey: rule.field });
    }
  }

  return resolved;
}

/**
 * Server-side re-check that every submitted approver id is actually eligible for the field it
 * was submitted through — compile.ts defers this ("directory membership resolves server-side
 * later") but nothing previously performed it, so any id was snapshotted verbatim. Two picker
 * shapes are validated:
 *  - `options.roles` (e.g. Project Manager, HR Head, Process Head): the id must hold one of
 *    those roles in the tenant.
 *  - `options.source === 'project-tech-leads'` (the Tech Lead field): the id must be a `TL`
 *    `ProjectMember` of one of the request's own project-picker project(s).
 * Fields with neither (e.g. an unrestricted watcher picker) are left unvalidated, unchanged.
 */
export async function assertApproversEligible(
  tenantId: string,
  definition: FormDefinition,
  resolved: ResolvedApprover[],
  payload: Record<string, unknown>,
): Promise<void> {
  const byField = new Map<string, ResolvedApprover[]>();
  for (const approver of resolved) {
    if (!approver.fieldKey) continue;
    const list = byField.get(approver.fieldKey) ?? [];
    list.push(approver);
    byField.set(approver.fieldKey, list);
  }

  for (const [fieldKey, approvers] of byField) {
    const field = findField(definition, fieldKey);
    const config = field ? asPickerConfig(field.options) : undefined;
    const ids = [...new Set(approvers.map((a) => a.approverId))];
    const label = field?.label ?? fieldKey;

    if (config?.roles?.length) {
      const eligible = await prisma.user.findMany({
        where: { tenantId, id: { in: ids }, roles: { some: { role: { key: { in: config.roles } } } } },
        select: { id: true },
      });
      const eligibleIds = new Set(eligible.map((u) => u.id));
      if (ids.some((id) => !eligibleIds.has(id))) {
        throw new HttpError(400, `Selected ${label} does not hold the required role.`);
      }
      continue;
    }

    if (config?.source === 'project-tech-leads') {
      const projectField = definition.sections.flatMap((s) => s.fields).find((f) => f.type === 'project-picker');
      const projectValue = projectField ? payload[projectField.key] : undefined;
      const projectIds = Array.isArray(projectValue)
        ? projectValue.filter((v): v is string => typeof v === 'string')
        : typeof projectValue === 'string' && projectValue
          ? [projectValue]
          : [];

      const eligible = projectIds.length
        ? await prisma.projectMember.findMany({
            where: { userId: { in: ids }, roleInProject: 'TL', projectId: { in: projectIds }, project: { tenantId } },
            select: { userId: true },
          })
        : [];
      const eligibleIds = new Set(eligible.map((m) => m.userId));
      if (ids.some((id) => !eligibleIds.has(id))) {
        throw new HttpError(400, `Selected ${label} is not a Tech Lead on the selected project.`);
      }
    }
  }
}
