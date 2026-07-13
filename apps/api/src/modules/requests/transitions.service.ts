import type { Prisma } from '@prisma/client';
import {
  REQUESTER_ROLE,
  statusModelSchema,
  SYSTEM_ROLE,
  SystemRoleKey,
  type RequestDto,
  type StatusTransition,
  type TransitionRequestInput,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { requiresBalanceRestore, restoreBalanceOnCancel } from './extractors.js';
import { recordVisitorCheckIn, recordVisitorCheckOut } from './visitor-lifecycle.js';
import * as notificationsService from '../notifications/notifications.service.js';

/** The authenticated caller attempting a transition. */
export interface TransitionActor {
  id: string;
  roles: string[];
}

export type RequestWithForm = Prisma.RequestGetPayload<{
  include: { form: { include: { statusModel: true } } };
}>;

/**
 * Notify the requester of a status change, inside the transition's transaction. Skipped when
 * the requester is the one performing the transition (e.g. withdraw/cancel) — no need to notify
 * yourself of your own action. A decision-engine outcome maps to the approval-outcome
 * notifications (naming the actor, or a rejection reason); every other transition (approver-,
 * admin-, or system-triggered) is a generic status change. `decisionOutcome` — not the
 * transition's target state name — decides which, since the *name* of a reject outcome isn't
 * always literally "Rejected" (Visitor uses "Cancelled"; see `decisions.service.ts`).
 */
async function notifyRequesterOfTransition(
  tx: Prisma.TransactionClient,
  tenantId: string,
  request: RequestWithForm,
  transition: StatusTransition,
  actorId: string | null,
  note: string | undefined,
  decisionOutcome?: 'approved' | 'rejected',
): Promise<void> {
  if (actorId === request.requesterId) return;

  const basePayload = { requestId: request.id, formKey: request.form.key, formTitle: request.form.title };

  if (decisionOutcome) {
    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: { name: true } }) : null;
    const approverName = actor?.name ?? 'An approver';
    if (decisionOutcome === 'approved') {
      await notificationsService.notify(tx, tenantId, request.requesterId, {
        type: 'request_approved',
        payload: { ...basePayload, approverName },
      });
    } else {
      await notificationsService.notify(tx, tenantId, request.requesterId, {
        type: 'request_rejected',
        payload: { ...basePayload, approverName, reason: note ?? null },
      });
    }
  } else {
    await notificationsService.notify(tx, tenantId, request.requesterId, {
      type: 'request_status_changed',
      payload: { ...basePayload, toState: transition.to },
    });
  }
}

/**
 * On a `Rejected` outcome, every *other* still-`pending` snapshotted approver is no longer
 * awaiting a decision — nothing they do can change an already-rejected request (the status
 * model has no transition out of `Rejected` for their role) — so their rows are reconciled to
 * `rejected` too, with no `comment` of their own (the reason belongs to whoever actually
 * rejected). An `Approved` outcome needs no reconciliation: by construction (see
 * `decisions.service.ts`) it's only reached once every snapshotted approver has individually
 * approved, so no `pending` rows remain. Without this, `listApprovalQueue`'s pending tab and
 * `listMyRequests`' approver-progress count would stay stuck on the now-moot snapshot forever.
 */
async function reconcileRemainingApprovers(
  tx: Prisma.TransactionClient,
  requestId: string,
  outcome: 'approved' | 'rejected',
): Promise<void> {
  await tx.requestApprover.updateMany({
    where: { requestId, decision: 'pending' },
    data: { decision: outcome, decidedAt: new Date() },
  });
}

/**
 * Shared transaction body for human-, system-, and decision-engine-triggered transitions:
 * optimistic-lock status update, `RequestStatusHistory` append, audit log, requester
 * notification, and (on `Approved -> Cancelled` for balance-bearing forms) the balance-restore
 * hook. `actorId` is `null` for the system actor. `reconcilePending` is set only by the decision
 * engine's `Rejected` outcome (see `reconcileRemainingApprovers`) — every other transition
 * (withdraw, cancel, system auto-complete, the decision engine's own `Approved` outcome) leaves
 * it unset.
 */
async function applyTransitionBody(
  tx: Prisma.TransactionClient,
  tenantId: string,
  request: RequestWithForm,
  transition: StatusTransition,
  actorId: string | null,
  note: string | undefined,
  decisionOutcome?: 'approved' | 'rejected',
): Promise<RequestDto> {
  // Optimistic lock: only apply if the status is still what we just read.
  const { count } = await tx.request.updateMany({
    where: { id: request.id, tenantId, status: request.status },
    data: { status: transition.to },
  });
  if (count === 0) {
    throw new HttpError(409, 'Request status changed concurrently — retry');
  }
  await tx.requestStatusHistory.create({
    data: {
      requestId: request.id,
      fromState: request.status,
      toState: transition.to,
      actorId,
      note,
    },
  });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorId,
      entity: 'Request',
      entityId: request.id,
      action: 'transition',
      before: { status: request.status },
      after: { status: transition.to },
    },
  });
  if (decisionOutcome) {
    // A no-op for the 'approved' outcome — by construction no rows are still pending by then.
    await reconcileRemainingApprovers(tx, request.id, decisionOutcome);
  }
  if (transition.from === 'Approved' && transition.to === 'Cancelled' && requiresBalanceRestore(request.form.key)) {
    await restoreBalanceOnCancel(tx, {
      tenantId,
      requestId: request.id,
      requesterId: request.requesterId,
      formKey: request.form.key,
      leaveTypeId: request.leaveTypeId,
      totalDays: request.totalDays,
      halfDayCount: request.halfDayCount,
    });
  }
  if (request.form.key === 'visitor') {
    if (transition.from === 'Approved' && transition.to === 'Checked-In') {
      await recordVisitorCheckIn(tx, request.id);
    }
    if (transition.from === 'Checked-In' && transition.to === 'Checked-Out') {
      await recordVisitorCheckOut(tx, request.id);
    }
  }
  await notifyRequesterOfTransition(tx, tenantId, request, transition, actorId, note, decisionOutcome);
  const updated = await tx.request.findUniqueOrThrow({ where: { id: request.id } });

  return {
    id: updated.id,
    formKey: request.form.key,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  };
}

async function applyTransition(
  tenantId: string,
  request: RequestWithForm,
  transition: StatusTransition,
  actorId: string | null,
  note: string | undefined,
): Promise<RequestDto> {
  return prisma.$transaction((tx) => applyTransitionBody(tx, tenantId, request, transition, actorId, note));
}

/**
 * The decision engine's outcome transition (`decisions.service.ts`): finds the form's declared
 * `{from: request.status, to: toState}` transition and applies it inside the caller's own
 * transaction — combining the approver-decision write and the resulting status flip into one
 * atomic unit (design.md). Authorization is the decision engine's own (snapshotted pending
 * approver), not the generic role-gate `transitionRequest` enforces, so this is not exported
 * as its own HTTP-reachable path. `decisionOutcome` drives both moot-reconciliation and which
 * notification fires — not `toState`'s literal name, which isn't always "Approved"/"Rejected"
 * (Visitor's reject outcome is named "Cancelled").
 */
export async function applyDeclaredTransition(
  tx: Prisma.TransactionClient,
  tenantId: string,
  request: RequestWithForm,
  toState: string,
  actorId: string,
  note: string | undefined,
  decisionOutcome?: 'approved' | 'rejected',
): Promise<RequestDto> {
  const statusModel = statusModelSchema.parse(request.form.statusModel);
  const transition = statusModel.transitions.find((t) => t.from === request.status && t.to === toState);
  if (!transition) {
    throw new HttpError(400, `No transition declared from "${request.status}" to "${toState}"`);
  }
  return applyTransitionBody(tx, tenantId, request, transition, actorId, note, decisionOutcome);
}

/**
 * Move a request along a transition declared in its form's `StatusModel`: check the
 * transition is declared for the request's current status, gate it by the actor's roles
 * (or `requester` when the actor is the request's own requester — `system`-gated
 * transitions are never reachable by a human actor here), then update the status and
 * append a `RequestStatusHistory` row, all in one transaction. An optimistic check on the
 * current status inside the update guards against a concurrent transition on the same request.
 *
 * Withdraw is additionally guarded against the approval engine's own state: under parallel
 * (AND-gate) approval, a partial decision does NOT move `request.status` off `Pending
 * Approval` (approval-workflow) — a require-gated withdraw transition declared "from Pending
 * Approval" would otherwise still be reachable after the first approver has already acted. So
 * a `requester`-gated transition is refused once ANY snapshotted approver has a non-pending
 * decision, regardless of what the declared-transition check alone would allow. A post-approval
 * cancel is instead declared `Approved -> Cancelled` gated to HR/Enterprise Admin roles only;
 * when that exact transition fires on a balance-bearing form (Leave), the balance-restore hook
 * runs inside the same transaction.
 */
export async function transitionRequest(
  tenantId: string,
  requestId: string,
  actor: TransitionActor,
  input: TransitionRequestInput,
): Promise<RequestDto> {
  const request = await prisma.request.findFirst({
    where: { id: requestId, tenantId },
    include: { form: { include: { statusModel: true } }, approvers: true },
  });
  if (!request) throw new HttpError(404, 'Request not found');
  if (!request.form.statusModel) throw new HttpError(400, 'Form has no status model');

  // Approve/Reject outcomes for a request under the decision engine (it has a snapshotted
  // approver set) must go through the decision endpoint — its authorization (snapshotted
  // pending approver) is stricter than and independent of this generic role gate.
  if ((input.toState === 'Approved' || input.toState === 'Rejected') && request.approvers.length > 0) {
    throw new HttpError(400, 'Use the decision endpoint to approve or reject this request');
  }

  const statusModel = statusModelSchema.parse(request.form.statusModel);
  const transition = statusModel.transitions.find(
    (t) => t.from === request.status && t.to === input.toState,
  );
  if (!transition) {
    throw new HttpError(400, `No transition declared from "${request.status}" to "${input.toState}"`);
  }

  const isRequester = transition.roles.includes(REQUESTER_ROLE) && actor.id === request.requesterId;
  const hasGatedRole = transition.roles.some(
    (role) => role !== REQUESTER_ROLE && role !== SYSTEM_ROLE && actor.roles.includes(role),
  );
  if (!isRequester && !hasGatedRole) {
    throw new HttpError(403, 'You are not authorized to perform this transition');
  }
  if (isRequester && request.approvers.some((a) => a.decision !== 'pending')) {
    throw new HttpError(409, 'An approver has already acted on this request — it can no longer be withdrawn.');
  }
  // IT fulfilment is claim-based (it-requests design.md: "first admin to claim owns it") — any
  // IT-Admin-gated lifecycle step on an IT request additionally requires the actor to be the
  // request's own claimed assignee, not just any IT Admin.
  if (request.form.key === 'it' && transition.roles.includes(SystemRoleKey.ItAdmin)) {
    if (!request.itAssigneeId) {
      throw new HttpError(409, 'Assign this request to yourself before updating it.');
    }
    if (request.itAssigneeId !== actor.id) {
      throw new HttpError(403, 'Only the assigned IT Admin can update this request.');
    }
  }

  return applyTransition(tenantId, request, transition, actor.id, input.note);
}

/**
 * System-actor counterpart of `transitionRequest`, used by scheduled jobs: only matches a
 * transition explicitly gated to the reserved `system` role (never reachable by a human actor
 * via `transitionRequest`), then runs the same locked transition transaction with a `null`
 * actor. Used by the daily auto-complete job (`Approved -> Completed` for Leave/WFH).
 */
export async function systemTransitionRequest(
  tenantId: string,
  requestId: string,
  toState: string,
): Promise<RequestDto> {
  const request = await prisma.request.findFirst({
    where: { id: requestId, tenantId },
    include: { form: { include: { statusModel: true } } },
  });
  if (!request) throw new HttpError(404, 'Request not found');
  if (!request.form.statusModel) throw new HttpError(400, 'Form has no status model');

  const statusModel = statusModelSchema.parse(request.form.statusModel);
  const transition = statusModel.transitions.find(
    (t) => t.from === request.status && t.to === toState && t.roles.includes(SYSTEM_ROLE),
  );
  if (!transition) {
    throw new HttpError(400, `No system-gated transition declared from "${request.status}" to "${toState}"`);
  }

  return applyTransition(tenantId, request, transition, null, undefined);
}
