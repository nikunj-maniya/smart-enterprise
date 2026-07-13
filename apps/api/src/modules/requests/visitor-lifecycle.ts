import type { Prisma } from '@prisma/client';

/** Creates the 1:1 `Visitor` row (consent + check-in/out timestamps) alongside a newly
 *  submitted Visitor Registration request — `visitor-registration` spec's consent persistence. */
export async function createVisitorRecord(
  tx: Prisma.TransactionClient,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.visitor.create({
    data: { requestId, consent: payload.privacy_consent === true },
  });
}

/** Fired inside the same transition transaction as `Approved -> Checked-In` / `Checked-In ->
 *  Checked-Out` (front-desk spec) — records the real-time timestamp the Front Desk queries on. */
export async function recordVisitorCheckIn(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
  await tx.visitor.update({ where: { requestId }, data: { checkInAt: new Date() } });
}

export async function recordVisitorCheckOut(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
  await tx.visitor.update({ where: { requestId }, data: { checkOutAt: new Date() } });
}
