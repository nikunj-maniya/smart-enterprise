import type { Prisma } from '@prisma/client';
import {
  REQUESTER_ROLE,
  statusModelSchema,
  SYSTEM_ROLE,
  type RequestDto,
  type StatusTransition,
  type TransitionRequestInput,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { requiresBalanceRestore, restoreBalanceOnCancel } from './extractors.js';

/** The authenticated caller attempting a transition. */
export interface TransitionActor {
  id: string;
  roles: string[];
}

type RequestWithForm = Prisma.RequestGetPayload<{
  include: { form: { include: { statusModel: true } } };
}>;

/**
 * Shared transaction body for both human- and system-triggered transitions: optimistic-lock
 * status update, `RequestStatusHistory` append, audit log, and (on `Approved -> Cancelled`
 * for balance-bearing forms) the balance-restore hook. `actorId` is `null` for the system actor.
 */
async function applyTransition(
  tenantId: string,
  request: RequestWithForm,
  transition: StatusTransition,
  actorId: string | null,
  note: string | undefined,
): Promise<RequestDto> {
  const updated = await prisma.$transaction(async (tx) => {
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
    if (transition.from === 'Approved' && transition.to === 'Cancelled' && requiresBalanceRestore(request.form.key)) {
      await restoreBalanceOnCancel(tx, {
        tenantId,
        requestId: request.id,
        formKey: request.form.key,
        leaveTypeId: request.leaveTypeId,
        totalDays: request.totalDays,
        halfDayCount: request.halfDayCount,
      });
    }
    return tx.request.findUniqueOrThrow({ where: { id: request.id } });
  });

  return {
    id: updated.id,
    formKey: request.form.key,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * Move a request along a transition declared in its form's `StatusModel`: check the
 * transition is declared for the request's current status, gate it by the actor's roles
 * (or `requester` when the actor is the request's own requester — `system`-gated
 * transitions are never reachable by a human actor here), then update the status and
 * append a `RequestStatusHistory` row, all in one transaction. An optimistic check on the
 * current status inside the update guards against a concurrent transition on the same request.
 *
 * Withdraw/cancel are not special-cased: each core form's `StatusModel` only declares a
 * requester-gated withdraw transition out of its pre-approval states, so once any approver
 * has approved/rejected (moving the request out of those states) the declared-transition
 * check above already refuses a later withdraw attempt. A post-approval cancel is instead
 * declared `Approved -> Cancelled` gated to HR/Enterprise Admin roles only; when that exact
 * transition fires on a balance-bearing form (Leave/WFH), the balance-restore hook runs
 * inside the same transaction.
 */
export async function transitionRequest(
  tenantId: string,
  requestId: string,
  actor: TransitionActor,
  input: TransitionRequestInput,
): Promise<RequestDto> {
  const request = await prisma.request.findFirst({
    where: { id: requestId, tenantId },
    include: { form: { include: { statusModel: true } } },
  });
  if (!request) throw new HttpError(404, 'Request not found');
  if (!request.form.statusModel) throw new HttpError(400, 'Form has no status model');

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
