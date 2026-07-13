import type { Prisma } from '@prisma/client';

interface LockedBalance {
  id: string;
  balance: number;
}

/** Calendar-year balance period (Asia/Kolkata) — matches `org-masters/seed.service.ts`. */
function currentLeavePeriod(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).getUTCFullYear().toString();
}

/** `SELECT ... FOR UPDATE` on the one balance row (design.md) — serializes concurrent
 *  final-approval races on the same (user, leaveType, period) so exactly one deduction commits. */
async function lockBalanceRow(
  tx: Prisma.TransactionClient,
  userId: string,
  leaveTypeId: string,
  period: string,
): Promise<LockedBalance | null> {
  const rows = await tx.$queryRaw<LockedBalance[]>`
    SELECT id, balance FROM "LeaveBalance"
    WHERE "userId" = ${userId} AND "leaveTypeId" = ${leaveTypeId} AND period = ${period}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Adjusts a requester's leave balance for one leave type by `sign * effectiveDays`, under a row
 * lock, re-reading the current value at the moment of adjustment (design.md's "re-checks
 * balance at that moment"). A no-op for: non-leave forms (`leaveTypeName` unset), an unresolved
 * or LWP (`isPaid: false`) type — LWP never touches a balance (leave-balances spec) — or a
 * missing balance row (shouldn't happen; every paid type gets one at user creation).
 *
 * Half-days deduct 0.5 each (design.md, a locked PRD decision): `totalDays` is the plain
 * day count as entered, so `halfDayCount` of those days count as 0.5 instead of 1 —
 * `effectiveDays = totalDays - 0.5 * halfDayCount`.
 */
export async function adjustLeaveBalance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requesterId: string,
  leaveTypeName: string | null,
  totalDays: number | null,
  halfDayCount: number | null,
  sign: 1 | -1,
): Promise<void> {
  if (!leaveTypeName || !totalDays) return;

  const leaveType = await tx.leaveType.findFirst({ where: { tenantId, name: leaveTypeName } });
  if (!leaveType || !leaveType.isPaid) return;

  const effectiveDays = totalDays - 0.5 * (halfDayCount ?? 0);
  if (effectiveDays <= 0) return;

  const locked = await lockBalanceRow(tx, requesterId, leaveType.id, currentLeavePeriod());
  if (!locked) return;

  await tx.leaveBalance.update({ where: { id: locked.id }, data: { balance: locked.balance + sign * effectiveDays } });
}
