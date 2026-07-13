import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import type { ResolvedApprover } from './approver-resolution.js';

function daysBetween(startIso: unknown, endIso: unknown): number | null {
  if (typeof startIso !== 'string' || typeof endIso !== 'string') return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Independent server-side re-check of the "> 2 days requires HR sign-off" rule (leave-requests
 * / wfh-requests specs): computed from the actual `start_date`/`end_date`, not trusted from the
 * client's `away_duration`/`duration` radio — a client could submit "≤ 2 days" alongside dates
 * that actually span more. Refuses submission until an HR Head stage is present.
 */
export function assertHrSignoffPresentWhenRequired(
  formKey: string,
  payload: Record<string, unknown>,
  approvers: ResolvedApprover[],
): void {
  if (formKey !== 'leave' && formKey !== 'wfh') return;
  const days = daysBetween(payload.start_date, payload.end_date);
  if (days === null || days <= 2) return;
  const hasHrSignoff = approvers.some((a) => a.roleContext === 'hr-head');
  if (!hasHrSignoff) {
    throw new HttpError(400, 'This request spans more than 2 days and requires an HR Head sign-off.');
  }
}

const HALF_DAY_FIELD_BY_FORM_KEY: Record<string, string> = { leave: 'half_day_dates', wfh: 'half_wfh_dates' };

/**
 * Independent server-side re-check that every selected half-day date actually falls within
 * [start_date, end_date] (reporting-and-polish: half-days upgraded from a count to specific
 * dates) — the client's date picker doesn't constrain entry to the range, so this is the
 * authoritative check, mirroring `assertHrSignoffPresentWhenRequired`'s pattern.
 */
export function assertHalfDayDatesInRange(formKey: string, payload: Record<string, unknown>): void {
  const field = HALF_DAY_FIELD_BY_FORM_KEY[formKey];
  if (!field) return;
  const halfDayDates = payload[field];
  if (!Array.isArray(halfDayDates) || halfDayDates.length === 0) return;

  const start = payload.start_date;
  const end = payload.end_date;
  if (typeof start !== 'string' || typeof end !== 'string') return;

  const outOfRange = halfDayDates.some((d) => typeof d !== 'string' || d < start || d > end);
  if (outOfRange) {
    throw new HttpError(400, 'Half-day dates must fall within the selected start and end date.');
  }
}

/** Calendar-year balance period (Asia/Kolkata) — matches `seed.service.ts`. */
function currentLeavePeriod(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).getUTCFullYear().toString();
}

/**
 * Over-balance warning flag (leave-balances spec): `leave` requests only — `Request.leaveTypeId`
 * holds the submitted `leave_type` *label*, resolved here to a real `LeaveType` by name (see
 * `extractors.ts`'s doc comment). LWP (`isPaid: false`) is never over-balance — it has no
 * balance to exceed. Returns `null` for non-leave forms (the field doesn't apply).
 */
export async function computeOverBalance(
  tenantId: string,
  requesterId: string,
  formKey: string,
  totalDays: number | undefined,
  leaveTypeName: string | undefined,
): Promise<boolean | null> {
  if (formKey !== 'leave' || !leaveTypeName || totalDays === undefined) return null;

  const leaveType = await prisma.leaveType.findFirst({ where: { tenantId, name: leaveTypeName } });
  if (!leaveType || !leaveType.isPaid) return false;

  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_period: { userId: requesterId, leaveTypeId: leaveType.id, period: currentLeavePeriod() } },
  });
  const remaining = balance?.balance ?? 0;
  return totalDays > remaining;
}

/**
 * Special-condition soft flag (wfh-requests spec): `wfh` requests only, marked
 * `special_condition: 'Yes'`. "Validated against the employee's request history" is
 * implemented as: flagged when the requester has claimed special-condition on a prior WFH
 * request — a one-off claim is unremarkable, a repeated pattern is what HR should see. Never
 * blocks; returns `null` for non-WFH forms.
 */
export async function computeSpecialConditionFlag(
  tenantId: string,
  requesterId: string,
  formKey: string,
  payload: Record<string, unknown>,
): Promise<boolean | null> {
  if (formKey !== 'wfh') return null;
  if (payload.special_condition !== 'Yes') return false;

  // Count prior requests that *claimed* special-condition (not prior requests that were
  // *flagged* — only the 2nd+ claim is ever flagged, so counting flagged rows would always be 0.
  const priorCount = await prisma.request.count({
    where: {
      tenantId,
      requesterId,
      form: { key: 'wfh' },
      payload: { path: ['special_condition'], equals: 'Yes' },
    },
  });
  return priorCount > 0;
}
