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
  type RequestDto,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import * as formsService from '../forms/forms.service.js';
import * as notificationsService from '../notifications/notifications.service.js';
import { resolveApprovers } from './approver-resolution.js';
import { extractPromotedColumns } from './extractors.js';

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

  const promoted = extractPromotedColumns(input.formKey, result.data!);
  const stageRules = form.approvalWorkflow ? stageRulesSchema.parse(form.approvalWorkflow.stageRules) : null;
  const approvers = resolveApprovers(form.definition, stageRules, result.data!);
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: requesterId }, select: { name: true } });

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.request.create({
      data: {
        tenantId,
        formDefinitionId: form.id,
        formVersion: form.version,
        requesterId,
        status: form.initialStatus,
        payload: result.data as Prisma.InputJsonValue,
        ...promoted,
      },
    });
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
    for (const a of row.request.approvers) chainApproverIds.add(a.approverId);
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
      chain: req.approvers.map((a) => ({
        approverId: a.approverId,
        approverName: nameByApproverId.get(a.approverId) ?? 'Unknown',
        roleContext: a.roleContext,
        decision: toDecision(a.decision),
        comment: a.comment ?? null,
      })),
    };
  });

  return { rows, awaitingCount, decidedCount };
}
