import type { LeaveBalanceDto } from '@se/shared';
import { prisma } from '../../prisma.js';

/** Calendar-year balance period (Asia/Kolkata) — matches `seed.service.ts`'s `currentLeavePeriod`. */
function currentLeavePeriod(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).getUTCFullYear().toString();
}

/** GET /leave-balances/me — the caller's own balance per paid leave type, for the My Requests
 *  balance cards (leave-requests spec). `total` is the type's *current* policy quota — if the
 *  Enterprise Admin changes it mid-year, `updateLeaveType` refreshes existing balance rows by
 *  the delta, so `total - balance` (`used`) stays consistent with what was actually taken. */
export async function getMyLeaveBalances(tenantId: string, userId: string): Promise<LeaveBalanceDto[]> {
  const period = currentLeavePeriod();
  const rows = await prisma.leaveBalance.findMany({
    where: { userId, period, leaveType: { tenantId } },
    include: { leaveType: { select: { id: true, name: true, quota: true } } },
    orderBy: { leaveType: { name: 'asc' } },
  });
  return rows.map((r) => ({
    leaveTypeId: r.leaveType.id,
    leaveTypeName: r.leaveType.name,
    used: Math.max(0, r.leaveType.quota - r.balance),
    total: r.leaveType.quota,
  }));
}
