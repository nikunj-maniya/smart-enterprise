import type { Prisma } from '@prisma/client';
import { SystemRoleKey } from '@se/shared';
import type { ResolvedApprover } from './approver-resolution.js';

/** An active user in the tenant holding `roleId`, excluding `excludeUserIds` (the requester
 *  and/or the approver already stuck) — deterministic (lowest id) when more than one holds the role. */
async function findActiveRoleHolder(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roleId: string,
  excludeUserIds: string[],
): Promise<string | null> {
  const row = await tx.userRole.findFirst({
    where: { roleId, user: { tenantId, status: 'Active', id: { notIn: excludeUserIds } } },
    orderBy: { userId: 'asc' },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/** The tenant's Enterprise Admin — the terminal escalation fallback (design.md): guaranteed to
 *  exist (created at tenant activation), used when the matrix's configured target role has no
 *  available holder, so escalation never loops indefinitely. */
async function findEnterpriseAdmin(
  tx: Prisma.TransactionClient,
  tenantId: string,
  excludeUserIds: string[],
): Promise<string | null> {
  const row = await tx.user.findFirst({
    where: {
      tenantId,
      status: 'Active',
      id: { notIn: excludeUserIds },
      roles: { some: { role: { key: SystemRoleKey.EnterpriseAdmin } } },
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * The escalation matrix row for a `RequestApprover.roleContext`, or `null` if the tenant hasn't
 * configured one for it (that stage then simply isn't escalatable — see callers).
 */
export async function getEscalationRule(tx: Prisma.TransactionClient, tenantId: string, roleContext: string) {
  return tx.escalationRule.findUnique({ where: { tenantId_fromContext: { tenantId, fromContext: roleContext } } });
}

/**
 * Resolve where a `roleContext` stage escalates to: the matrix's target role's active holder,
 * falling back to the tenant's Enterprise Admin if that role has no available holder (or the
 * tenant has no matrix entry at all for a case that still needs *some* target — self-approval
 * escalation always needs a stand-in). Returns `null` only when even the Enterprise Admin
 * fallback is unavailable (excluded or missing), which should not happen in practice.
 */
export async function resolveEscalationTarget(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roleContext: string,
  excludeUserIds: string[],
): Promise<string | null> {
  const rule = await getEscalationRule(tx, tenantId, roleContext);
  if (rule) {
    const targetUserId = await findActiveRoleHolder(tx, tenantId, rule.toRoleId, excludeUserIds);
    if (targetUserId) return targetUserId;
  }
  return findEnterpriseAdmin(tx, tenantId, excludeUserIds);
}

/**
 * No self-approval (escalation spec): any resolved stage whose approver is the requester
 * themself is replaced by that stage's escalation target instead. Applied once, at submission,
 * inside the same transaction as the rest of resolution — the snapshot that results is what
 * governs the request for its whole life. A stage with no configured matrix entry AND no
 * Enterprise Admin fallback (should not happen — EA always exists) is dropped rather than
 * blocking submission.
 */
export async function applySelfApprovalEscalation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requesterId: string,
  approvers: ResolvedApprover[],
): Promise<ResolvedApprover[]> {
  const resolved: ResolvedApprover[] = [];
  const seen = new Set<string>();

  for (const approver of approvers) {
    let approverId = approver.approverId;
    if (approverId === requesterId) {
      const target = await resolveEscalationTarget(tx, tenantId, approver.roleContext, [requesterId]);
      if (!target) continue;
      approverId = target;
    }
    const dedupeKey = `${approverId}:${approver.roleContext}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    resolved.push({ approverId, roleContext: approver.roleContext });
  }

  return resolved;
}
