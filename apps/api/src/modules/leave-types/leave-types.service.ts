import { UserStatus } from '@prisma/client';
import type {
  AbsenceCapDto,
  CreateLeaveTypeRequest,
  LeaveTypeDto,
  UpdateAbsenceCapRequest,
  UpdateLeaveTypeRequest,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { currentLeavePeriod } from '../org-masters/seed.service.js';

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

/** No unique on `(tenantId, name)` in the schema, so uniqueness is enforced here — insensitive,
 *  because `Request.leaveTypeId` stores the submitted *label* and the ledger resolves it back by
 *  name (extractors.ts / leave-balance-ledger.ts): near-duplicate names invite mis-resolution. */
async function assertNameAvailable(tenantId: string, name: string, excludeId?: string): Promise<void> {
  const duplicate = await prisma.leaveType.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new HttpError(409, 'A leave type with this name already exists');
}

/** How many of the tenant's requests carry this type's name label (the only FK-less link —
 *  see `assertNameAvailable`); the in-use guard for delete and rename. */
function countReferencingRequests(tenantId: string, name: string): Promise<number> {
  return prisma.request.count({ where: { tenantId, leaveTypeId: name } });
}

/**
 * POST /leave-types — create a leave type, audit-logged. A paid type immediately gets this
 * period's `LeaveBalance` row (at the new quota) for every Active user — mirroring
 * `initializeUserLeaveBalances` (paid-only, IST calendar-year period) so the type is
 * deductible without waiting for the next user-creation pass.
 */
export async function createLeaveType(
  tenantId: string,
  actorId: string,
  input: CreateLeaveTypeRequest,
): Promise<LeaveTypeDto> {
  await assertNameAvailable(tenantId, input.name);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.leaveType.create({
      data: {
        tenantId,
        name: input.name,
        quota: input.quota,
        isPaid: input.isPaid,
        accrualRule: { carryForward: input.carryForward, halfDayAllowed: input.halfDayAllowed },
      },
    });
    if (input.isPaid) {
      const period = currentLeavePeriod();
      const users = await tx.user.findMany({ where: { tenantId, status: UserStatus.Active }, select: { id: true } });
      await tx.leaveBalance.createMany({
        data: users.map((u) => ({ userId: u.id, leaveTypeId: row.id, period, balance: input.quota })),
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'LeaveType',
        entityId: row.id,
        action: 'create',
        after: {
          name: input.name,
          quota: input.quota,
          isPaid: input.isPaid,
          carryForward: input.carryForward,
          halfDayAllowed: input.halfDayAllowed,
        },
      },
    });
    return row;
  });

  return toDto(created);
}

/**
 * PUT /leave-types/:id — save a leave type's allocation/toggles (and, from the edit dialog,
 * name/`isPaid`), audit-logged. Existing `LeaveBalance` rows for this type are refreshed by the
 * *delta* (new quota − old quota) so days already used this period stay used — a flat reset
 * would silently un-deduct them. Renaming is blocked while requests reference the old name
 * (they link by label — see `countReferencingRequests`); a newly-paid type gets this period's
 * balance rows (none exist while unpaid), while paid→unpaid keeps its rows — the ledger skips
 * unpaid types anyway, and deleting them would erase consumption history.
 */
export async function updateLeaveType(
  tenantId: string,
  actorId: string,
  id: string,
  input: UpdateLeaveTypeRequest,
): Promise<LeaveTypeDto> {
  const existing = await prisma.leaveType.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Leave type not found');

  const name = input.name ?? existing.name;
  const isPaid = input.isPaid ?? existing.isPaid;

  if (name !== existing.name) {
    await assertNameAvailable(tenantId, name, id);
    const referencing = await countReferencingRequests(tenantId, existing.name);
    if (referencing > 0) {
      throw new HttpError(
        409,
        `Cannot rename "${existing.name}": ${referencing} leave request(s) reference it`,
      );
    }
  }

  const delta = input.quota - existing.quota;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.leaveType.update({
      where: { id },
      data: {
        name,
        isPaid,
        quota: input.quota,
        accrualRule: { carryForward: input.carryForward, halfDayAllowed: input.halfDayAllowed },
      },
    });
    if (delta !== 0) {
      await tx.leaveBalance.updateMany({ where: { leaveTypeId: id }, data: { balance: { increment: delta } } });
    }
    if (isPaid && !existing.isPaid) {
      const period = currentLeavePeriod();
      const users = await tx.user.findMany({ where: { tenantId, status: UserStatus.Active }, select: { id: true } });
      for (const u of users) {
        await tx.leaveBalance.upsert({
          where: { userId_leaveTypeId_period: { userId: u.id, leaveTypeId: id, period } },
          update: {},
          create: { userId: u.id, leaveTypeId: id, period, balance: input.quota },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'LeaveType',
        entityId: id,
        action: 'update',
        before: { name: existing.name, quota: existing.quota, isPaid: existing.isPaid, accrualRule: existing.accrualRule },
        after: { name, quota: input.quota, isPaid, carryForward: input.carryForward, halfDayAllowed: input.halfDayAllowed },
      },
    });
    return row;
  });

  return toDto(updated);
}

/**
 * DELETE /leave-types/:id — delete an unused leave type, audit-logged. "In use" means any
 * tenant request carries this type's name label (`countReferencingRequests`) — those requests'
 * history and withdrawal refunds resolve by it, and consumption only ever happens through
 * requests, so no referencing requests ⇒ the auto-created `LeaveBalance` rows are zero-usage
 * and are removed in the same transaction (the FK is restrictive).
 */
export async function deleteLeaveType(tenantId: string, actorId: string, id: string): Promise<void> {
  const existing = await prisma.leaveType.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Leave type not found');

  const referencing = await countReferencingRequests(tenantId, existing.name);
  if (referencing > 0) {
    throw new HttpError(409, `Cannot delete "${existing.name}": ${referencing} leave request(s) use it`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveBalance.deleteMany({ where: { leaveTypeId: id } });
    await tx.leaveType.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'LeaveType',
        entityId: id,
        action: 'delete',
        before: { name: existing.name, quota: existing.quota, isPaid: existing.isPaid, accrualRule: existing.accrualRule },
      },
    });
  });
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
