import type { Prisma } from '@prisma/client';
import {
  stageRulesSchema,
  validatePayload,
  type ApprovalDecision,
  type ApprovalQueueItemDto,
  type ApprovalQueueQuery,
  type ApprovalQueueResponse,
  type CreateRequestInput,
  type MyRequestsQuery,
  type MyRequestsResponse,
  type RequestDetailDto,
  type RequestDto,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import * as formsService from '../forms/forms.service.js';
import * as notificationsService from '../notifications/notifications.service.js';
import { resolveApprovers } from './approver-resolution.js';
import { applySelfApprovalEscalation } from './escalation.service.js';
import { extractPromotedColumns } from './extractors.js';
import {
  assertHalfDayDatesInRange,
  assertHrSignoffPresentWhenRequired,
  computeOverBalance,
  computeSpecialConditionFlag,
} from './leave-wfh-rules.js';
import { createVisitorRecord } from './visitor-lifecycle.js';
import { assertItemsInActiveCatalog } from './it-catalog-rules.js';
import { canViewRequestDetail } from './visibility-policy.js';

/**
 * POST /requests — validate the payload against the tenant's latest published
 * definition (the version this request pins to), then in one transaction: create
 * the request in its form's initial state, append the first status-history row,
 * and write an audit log entry.
 */
export async function createRequest(
  tenantId: string,
  requesterId: string,
  input: CreateRequestInput,
): Promise<RequestDto> {
  // 404 if the form has no published version; a form with no configured status model
  // falls back to the generic default initial status.
  const form = await formsService.getPublishedDefinitionForSubmission(tenantId, input.formKey);

  const result = validatePayload(form.definition, input.payload);
  if (!result.success) {
    throw new HttpError(400, 'Validation failed', result.errors);
  }

  await assertItemsInActiveCatalog(tenantId, input.formKey, result.data!);
  assertHalfDayDatesInRange(input.formKey, result.data!);

  const promoted = extractPromotedColumns(input.formKey, result.data!);
  const stageRules = form.approvalWorkflow ? stageRulesSchema.parse(form.approvalWorkflow.stageRules) : null;
  const resolvedApprovers = resolveApprovers(form.definition, stageRules, result.data!);
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: requesterId }, select: { name: true } });

  // Leave/WFH-only computed flags (leave-wfh-requests) — pure reads, done ahead of the
  // transaction; `null` for every other form.
  const overBalance = await computeOverBalance(tenantId, requesterId, input.formKey, promoted.totalDays, promoted.leaveTypeId);
  const specialConditionFlagged = await computeSpecialConditionFlag(tenantId, requesterId, input.formKey, result.data!);

  const created = await prisma.$transaction(async (tx) => {
    // No self-approval (escalation spec): a stage that resolved to the requester is replaced by
    // its escalation target before the snapshot is written.
    const approvers = await applySelfApprovalEscalation(tx, tenantId, requesterId, resolvedApprovers);

    // Independent server-side re-check of the >2-days HR-signoff rule — computed from the
    // actual dates, not trusted from the client's duration radio (leave-requests/wfh-requests specs).
    assertHrSignoffPresentWhenRequired(input.formKey, result.data!, approvers);

    const request = await tx.request.create({
      data: {
        tenantId,
        formDefinitionId: form.id,
        formVersion: form.version,
        requesterId,
        status: form.initialStatus,
        payload: result.data as Prisma.InputJsonValue,
        ...promoted,
        overBalance,
        specialConditionFlagged,
      },
    });
    if (input.formKey === 'visitor') {
      await createVisitorRecord(tx, request.id, result.data!);
    }
    if (approvers.length > 0) {
      await tx.requestApprover.createMany({
        data: approvers.map((a) => ({
          requestId: request.id,
          approverId: a.approverId,
          roleContext: a.roleContext,
          decision: 'pending',
        })),
      });
    }
    await tx.requestStatusHistory.create({
      data: { requestId: request.id, fromState: null, toState: form.initialStatus, actorId: requesterId },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: requesterId,
        entity: 'Request',
        entityId: request.id,
        action: 'create',
        after: { formKey: input.formKey, status: form.initialStatus },
      },
    });
    const approverIds = [...new Set(approvers.map((a) => a.approverId))];
    await notificationsService.notifyMany(tx, tenantId, approverIds, {
      type: 'request_needs_approval',
      payload: {
        requestId: request.id,
        formKey: input.formKey,
        formTitle: form.definition.title,
        requesterName: requester.name,
      },
    });
    return request;
  });

  return {
    id: created.id,
    formKey: input.formKey,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * GET /requests/:id — the request's full detail, rendered against its own pinned
 * `formDefinitionId` (not the tenant's latest-by-key) so a later republish never changes how an
 * existing request displays. Reachable by the request's own requester or any of its snapshotted
 * approvers (approvals-queue spec's shared detail drawer); 404s for anyone else, a missing
 * request, or another tenant's.
 */
export async function getRequestById(
  tenantId: string,
  callerId: string,
  id: string,
): Promise<RequestDetailDto> {
  const request = await prisma.request.findFirst({
    where: { id, tenantId },
    include: { form: { select: { key: true, title: true } }, approvers: true },
  });
  if (!request) throw new HttpError(404, 'Request not found');

  if (!canViewRequestDetail(callerId, request)) throw new HttpError(404, 'Request not found');

  const definition = await formsService.getDefinitionById(tenantId, request.formDefinitionId);

  const approverIds = [
    ...new Set(request.approvers.flatMap((a) => [a.approverId, a.escalatedFromId].filter((v): v is string => !!v))),
  ];
  const approverUsers = await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } });
  const nameById = new Map(approverUsers.map((u) => [u.id, u.name]));

  return {
    id: request.id,
    formKey: request.form.key,
    formTitle: request.form.title,
    status: request.status,
    payload: request.payload as Record<string, unknown>,
    createdAt: request.createdAt.toISOString(),
    startDate: request.startDate?.toISOString() ?? null,
    endDate: request.endDate?.toISOString() ?? null,
    definition,
    requesterId: request.requesterId,
    overBalance: request.overBalance ?? null,
    specialConditionFlagged: request.specialConditionFlagged ?? null,
    approvers: request.approvers.map((a) => ({
      approverId: a.approverId,
      approverName: nameById.get(a.approverId) ?? 'Unknown',
      roleContext: a.roleContext,
      decision: toDecision(a.decision),
      comment: a.comment ?? null,
      escalatedFromName: a.escalatedFromId ? (nameById.get(a.escalatedFromId) ?? 'Unknown') : null,
      escalationCause: (a.escalationCause as 'on_leave' | 'inactive' | 'timeout' | null) ?? null,
    })),
  };
}

/** A nullable decision column always written as 'pending'/'approved'/'rejected'; never left null by this codebase. */
function toDecision(decision: string | null): ApprovalDecision {
  return (decision ?? 'pending') as ApprovalDecision;
}

/** GET /requests — the caller's own requests, newest first, optionally filtered by status. */
export async function listMyRequests(
  tenantId: string,
  requesterId: string,
  query: MyRequestsQuery,
): Promise<MyRequestsResponse> {
  const { page, pageSize, status } = query;
  const where: Prisma.RequestWhereInput = {
    tenantId,
    requesterId,
    ...(status ? { status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { form: { select: { key: true, title: true } }, approvers: { select: { decision: true } } },
    }),
    prisma.request.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      formKey: r.form.key,
      formTitle: r.form.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      startDate: r.startDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
      approversTotal: r.approvers.length,
      approversDecided: r.approvers.filter((a) => toDecision(a.decision) !== 'pending').length,
    })),
    total,
    page,
    pageSize,
  };
}

/** GET /requests/approvals — requests where the caller is a snapshotted approver, tabbed by their own decision. */
export async function listApprovalQueue(
  tenantId: string,
  approverId: string,
  query: ApprovalQueueQuery,
): Promise<ApprovalQueueResponse> {
  const { tab, roleContext } = query;
  const baseWhere: Prisma.RequestApproverWhereInput = {
    approverId,
    request: { tenantId },
    ...(roleContext ? { roleContext } : {}),
  };
  // All of a request's approvers are snapshotted together in one batch at submission, as a
  // single flat, parallel group — there's no later stage that repopulates them. So once the
  // request has transitioned even once since then (Approved/Rejected reconcile decision via
  // `recordApproverDecision`; anything else — Withdrawn, a pre-approval Cancel, etc. — does
  // not, since there's no real decision to attribute to approvers who never acted), any row
  // still `decision: 'pending'` is stale: nothing this approver does can matter anymore. A
  // request that has never transitioned has exactly one `RequestStatusHistory` row, written at
  // creation with `fromState: null`; every transition afterwards writes a non-null `fromState`.
  const stillAwaitable: Prisma.RequestApproverWhereInput = {
    request: { statusHistory: { none: { fromState: { not: null } } } },
  };

  const [awaitingCount, decidedCount, myRows] = await Promise.all([
    prisma.requestApprover.count({ where: { ...baseWhere, decision: 'pending', ...stillAwaitable } }),
    prisma.requestApprover.count({ where: { ...baseWhere, NOT: { decision: 'pending' } } }),
    prisma.requestApprover.findMany({
      where: {
        ...baseWhere,
        ...(tab === 'pending' ? { decision: 'pending', ...stillAwaitable } : { NOT: { decision: 'pending' } }),
      },
      include: {
        request: {
          include: {
            form: { select: { key: true, title: true } },
            requester: { select: { id: true, name: true, jobTitle: true } },
            approvers: true,
          },
        },
      },
      orderBy: { request: { createdAt: 'desc' } },
    }),
  ]);

  const chainApproverIds = new Set<string>();
  for (const row of myRows) {
    for (const a of row.request.approvers) {
      chainApproverIds.add(a.approverId);
      if (a.escalatedFromId) chainApproverIds.add(a.escalatedFromId);
    }
  }
  const approverUsers = await prisma.user.findMany({
    where: { id: { in: [...chainApproverIds] } },
    select: { id: true, name: true },
  });
  const nameByApproverId = new Map(approverUsers.map((u) => [u.id, u.name]));

  const rows: ApprovalQueueItemDto[] = myRows.map((row) => {
    const req = row.request;
    return {
      requestId: req.id,
      formKey: req.form.key,
      formTitle: req.form.title,
      requesterId: req.requester.id,
      requesterName: req.requester.name,
      requesterJobTitle: req.requester.jobTitle,
      startDate: req.startDate?.toISOString() ?? null,
      endDate: req.endDate?.toISOString() ?? null,
      submittedAt: req.createdAt.toISOString(),
      status: req.status,
      myDecision: toDecision(row.decision),
      overBalance: req.overBalance ?? null,
      specialConditionFlagged: req.specialConditionFlagged ?? null,
      chain: req.approvers.map((a) => ({
        approverId: a.approverId,
        approverName: nameByApproverId.get(a.approverId) ?? 'Unknown',
        roleContext: a.roleContext,
        decision: toDecision(a.decision),
        comment: a.comment ?? null,
        escalatedFromName: a.escalatedFromId ? (nameByApproverId.get(a.escalatedFromId) ?? 'Unknown') : null,
        escalationCause: (a.escalationCause as 'on_leave' | 'inactive' | 'timeout' | null) ?? null,
      })),
    };
  });

  return { rows, awaitingCount, decidedCount };
}
