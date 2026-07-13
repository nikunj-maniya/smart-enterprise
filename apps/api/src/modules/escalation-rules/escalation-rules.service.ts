import type { EscalationRuleDto, UpdateEscalationRuleInput } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function toDto(row: { id: string; fromContext: string; toRoleId: string; actionWindowHours: number; toRole: { name: string } }): EscalationRuleDto {
  return {
    id: row.id,
    fromContext: row.fromContext,
    toRoleId: row.toRoleId,
    toRoleName: row.toRole.name,
    actionWindowHours: row.actionWindowHours,
  };
}

/** GET /escalation-rules — the tenant's configured escalation matrix (escalation spec). */
export async function listEscalationRules(tenantId: string): Promise<EscalationRuleDto[]> {
  const rows = await prisma.escalationRule.findMany({
    where: { tenantId },
    include: { toRole: { select: { name: true } } },
    orderBy: { fromContext: 'asc' },
  });
  return rows.map(toDto);
}

/** PUT /escalation-rules/:id — retarget one matrix row's escalation role and/or action window. */
export async function updateEscalationRule(
  tenantId: string,
  actorId: string,
  id: string,
  input: UpdateEscalationRuleInput,
): Promise<EscalationRuleDto> {
  const existing = await prisma.escalationRule.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Escalation rule not found');

  const targetRole = await prisma.role.findFirst({ where: { id: input.toRoleId, tenantId } });
  if (!targetRole) throw new HttpError(400, 'Target role not found');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.escalationRule.update({
      where: { id },
      data: { toRoleId: input.toRoleId, actionWindowHours: input.actionWindowHours },
      include: { toRole: { select: { name: true } } },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'EscalationRule',
        entityId: id,
        action: 'update',
        before: { toRoleId: existing.toRoleId, actionWindowHours: existing.actionWindowHours },
        after: { toRoleId: input.toRoleId, actionWindowHours: input.actionWindowHours },
      },
    });
    return row;
  });

  return toDto(updated);
}
