import type { Prisma } from '@prisma/client';
import { validatePayload, type CreateRequestInput, type RequestDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import * as formsService from '../forms/forms.service.js';
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
    return request;
  });

  return {
    id: created.id,
    formKey: input.formKey,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  };
}
