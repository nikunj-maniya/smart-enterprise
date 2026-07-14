import { REQUESTER_ROLE, statusModelSchema, SYSTEM_ROLE, type RequestDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import * as notificationsService from '../notifications/notifications.service.js';
import { applyDeclaredTransition } from './transitions.service.js';
import { adjustLeaveBalance } from './leave-balance-ledger.js';

/**
 * The reject outcome's target state name isn't always literally "Rejected" — Visitor has no
 * such state at all, using "Cancelled" for a Process Head's rejection instead (visitor-management
 * spec). Rather than hardcode one literal name, prefer a declared `{from: status, to: 'Rejected'}`
 * transition when the form has one, falling back to `Cancelled` for forms that don't.
 */
function resolveRejectOutcomeState(rawStatusModel: unknown, fromStatus: string): string {
  const parsed = statusModelSchema.safeParse(rawStatusModel);
  if (!parsed.success) return 'Rejected';
  const hasRejected = parsed.data.transitions.some((t) => t.from === fromStatus && t.to === 'Rejected');
  return hasRejected ? 'Rejected' : 'Cancelled';
}

export type Decision = 'approved' | 'rejected';

/** The authenticated caller recording a decision. */
export interface DecisionActor {
  id: string;
}

/**
 * The transport-agnostic decision engine (design.md): record one snapshotted approver's own
 * decision, then evaluate the outcome — all-approved -> Approved, any-reject -> Rejected, else
 * stays pending — inside the same locked transaction so exactly one outcome transition fires
 * under a last-approver race. Authorization here (snapshotted pending approver) is independent
 * of `transitionRequest`'s generic role gate; see that function's own guard against the two
 * paths overlapping.
 */
export async function decideOnRequest(
  tenantId: string,
  requestId: string,
  actor: DecisionActor,
  decision: Decision,
  comment: string | undefined,
): Promise<RequestDto> {
  if (decision === 'rejected' && !comment?.trim()) {
    throw new HttpError(400, 'A reason is required to reject');
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.request.findFirst({
      where: { id: requestId, tenantId },
      include: { form: { include: { statusModel: true } }, approvers: true },
    });
    if (!request) throw new HttpError(404, 'Request not found');

    const myRow = request.approvers.find((a) => a.approverId === actor.id);
    if (!myRow) throw new HttpError(403, 'You are not an approver on this request');
    if (myRow.decision !== 'pending') throw new HttpError(409, 'You have already decided this request');

    // The request must still be sitting in a status its form's status model declares an
    // approver-actionable (non-requester, non-system) transition out of. Guards against a request
    // that moved on outside the decision engine (Withdrawn, a pre-approval Cancel, etc.) while this
    // approver's row was still `pending` — without this, their decision would be silently accepted
    // (or, for the last such decision, crash trying to apply a transition never declared for the
    // request's actual current status). Checking the status model's shape (rather than whether the
    // request has ever transitioned) means a request corrected back onto a decidable status stays
    // decidable too.
    const statusModel = statusModelSchema.parse(request.form.statusModel);
    const isStillDecidable = statusModel.transitions.some(
      (t) => t.from === request.status && t.roles.some((r) => r !== REQUESTER_ROLE && r !== SYSTEM_ROLE),
    );
    if (!isStillDecidable) {
      throw new HttpError(409, 'This request is no longer awaiting your decision.');
    }

    // Optimistic guard: only succeeds if still pending — blocks a concurrent double-decision
    // (e.g. two tabs) from both recording.
    const { count } = await tx.requestApprover.updateMany({
      where: { id: myRow.id, decision: 'pending' },
      data: {
        decision,
        decidedAt: new Date(),
        comment: decision === 'rejected' ? comment!.trim() : null,
      },
    });
    if (count === 0) throw new HttpError(409, 'You have already decided this request');

    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        entity: 'RequestApprover',
        entityId: myRow.id,
        action: decision,
        before: { decision: 'pending' },
        after: { decision, comment: decision === 'rejected' ? comment : undefined },
      },
    });

    const actorUser = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
    const basePayload = { requestId: request.id, formKey: request.form.key, formTitle: request.form.title };

    // Every not-yet-decided peer (excluding the actor) learns a co-approver just decided,
    // whether or not this decision is the one that finalizes the request.
    const freshApprovers = await tx.requestApprover.findMany({ where: { requestId } });
    const remainingPeerIds = [
      ...new Set(
        freshApprovers.filter((a) => a.decision === 'pending' && a.approverId !== actor.id).map((a) => a.approverId),
      ),
    ];
    if (remainingPeerIds.length > 0) {
      await notificationsService.notifyMany(tx, tenantId, remainingPeerIds, {
        type: 'approval_peer_decided',
        payload: { ...basePayload, approverName: actorUser.name, decision },
      });
    }

    if (decision === 'rejected') {
      const rejectState = resolveRejectOutcomeState(request.form.statusModel, request.status);
      return applyDeclaredTransition(tx, tenantId, request, rejectState, actor.id, comment, 'rejected');
    }

    const stillPending = freshApprovers.some((a) => a.decision === 'pending');
    if (!stillPending) {
      // Deduction rides this same final-decision transaction (design.md) — a `leave` request's
      // day count is debited from the matching balance right as the last approver approves;
      // LWP and non-leave forms no-op inside `adjustLeaveBalance`.
      if (request.form.key === 'leave') {
        await adjustLeaveBalance(tx, tenantId, request.requesterId, request.leaveTypeId, request.totalDays, request.halfDayCount, -1);
      }
      return applyDeclaredTransition(tx, tenantId, request, 'Approved', actor.id, undefined, 'approved');
    }

    // Partial approval — the request stays pending; the requester still hears about this
    // approver's decision.
    await notificationsService.notify(tx, tenantId, request.requesterId, {
      type: 'request_decision_update',
      payload: { ...basePayload, approverName: actorUser.name, decision },
    });

    return { id: request.id, formKey: request.form.key, status: request.status, createdAt: request.createdAt.toISOString() };
  });
}
