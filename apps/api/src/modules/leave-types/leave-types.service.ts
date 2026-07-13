import type { AbsenceCapDto, LeaveTypeDto, UpdateAbsenceCapRequest, UpdateLeaveTypeRequest } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

const DEFAULT_CONCURRENT_ABSENCE_CAP = 3;

interface AccrualRule {
  carryForward?: boolean;
  halfDayAllowed?: boolean;
}

function toDto(row: { id: string; name: string; quota: number; isPaid: boolean; accrualRule: unknown }): LeaveTypeDto {
  const rule = (row.accrualRule as AccrualRule | null) ?? {};
  return {
    id: row.id,
    name: row.name,
    quota: row.quota,
    isPaid: row.isPaid,
    carryForward: rule.carryForward ?? false,
    halfDayAllowed: rule.halfDayAllowed ?? false,
  };
}

/** GET /leave-types — the tenant's Leave Policy & Quotas (leave-balances spec). */
export async function listLeaveTypes(tenantId: string): Promise<LeaveTypeDto[]> {
  const rows = await prisma.leaveType.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  return rows.map(toDto);
}

/**
 * PUT /leave-types/:id — save a leave type's allocation/toggles, audit-logged. Existing
 * `LeaveBalance` rows for this type are refreshed by the *delta* (new quota − old quota) so
 * days already used this period stay used — a flat reset would silently un-deduct them.
 */
export async function updateLeaveType(
  tenantId: string,
  actorId: string,
  id: string,
  input: UpdateLeaveTypeRequest,
): Promise<LeaveTypeDto> {
  const existing = await prisma.leaveType.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Leave type not found');

  const delta = input.quota - existing.quota;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.leaveType.update({
      where: { id },
      data: {
        quota: input.quota,
        accrualRule: { carryForward: input.carryForward, halfDayAllowed: input.halfDayAllowed },
      },
    });
    if (delta !== 0) {
      await tx.leaveBalance.updateMany({ where: { leaveTypeId: id }, data: { balance: { increment: delta } } });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'LeaveType',
        entityId: id,
        action: 'update',
        before: { quota: existing.quota, accrualRule: existing.accrualRule },
        after: { quota: input.quota, carryForward: input.carryForward, halfDayAllowed: input.halfDayAllowed },
      },
    });
    return row;
  });

  return toDto(updated);
}

/** GET /leave-types/absence-cap — the tenant's concurrent-absence cap (absence-visibility's
 *  Admin Absence Calendar over-cap panel), stored in `Tenant.settings` alongside other tenant
 *  policy — no dedicated column for a single config number. */
export async function getAbsenceCap(tenantId: string): Promise<AbsenceCapDto> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const cap = settings.concurrentAbsenceCap;
  return { cap: typeof cap === 'number' ? cap : DEFAULT_CONCURRENT_ABSENCE_CAP };
}

/** PUT /leave-types/absence-cap — update the cap, audit-logged. */
export async function updateAbsenceCap(
  tenantId: string,
  actorId: string,
  input: UpdateAbsenceCapRequest,
): Promise<AbsenceCapDto> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const before = typeof settings.concurrentAbsenceCap === 'number' ? settings.concurrentAbsenceCap : DEFAULT_CONCURRENT_ABSENCE_CAP;

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, concurrentAbsenceCap: input.cap } } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Tenant',
        entityId: tenantId,
        action: 'update-absence-cap',
        before: { cap: before },
        after: { cap: input.cap },
      },
    });
  });

  return { cap: input.cap };
}
