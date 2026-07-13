import type { Request, Response, NextFunction } from 'express';
import {
  approvalQueueQuerySchema,
  createRequestSchema,
  decisionRequestSchema,
  fulfilmentQueueTabSchema,
  myRequestsQuerySchema,
  transitionRequestSchema,
} from '@se/shared';
import * as requestsService from './requests.service.js';
import * as transitionsService from './transitions.service.js';
import * as decisionsService from './decisions.service.js';
import * as fulfilmentService from '../fulfilment/fulfilment.service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createRequestSchema.parse(req.body);
    const dto = await requestsService.createRequest(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}

/** GET /requests — the caller's own request list (My Requests). */
export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const query = myRequestsQuerySchema.parse(req.query);
    const dto = await requestsService.listMyRequests(req.user!.tenantId!, req.user!.id, query);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

/** GET /requests/approvals — the caller's approver queue. */
export async function listApprovals(req: Request, res: Response, next: NextFunction) {
  try {
    const query = approvalQueueQuerySchema.parse(req.query);
    const dto = await requestsService.listApprovalQueue(req.user!.tenantId!, req.user!.id, query);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

/** GET /requests/:id — one of the caller's own requests, with its pinned form definition. */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = await requestsService.getRequestById(req.user!.tenantId!, req.user!.id, req.params.id);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

export async function transition(req: Request, res: Response, next: NextFunction) {
  try {
    const body = transitionRequestSchema.parse(req.body);
    const actor = { id: req.user!.id, roles: req.user!.roles };
    const dto = await transitionsService.transitionRequest(req.user!.tenantId!, req.params.id, actor, body);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

/** POST /requests/:id/decisions — the transport-agnostic decision engine's REST entrypoint. */
export async function decide(req: Request, res: Response, next: NextFunction) {
  try {
    const body = decisionRequestSchema.parse(req.body);
    const dto = await decisionsService.decideOnRequest(
      req.user!.tenantId!,
      req.params.id,
      { id: req.user!.id },
      body.decision,
      body.comment,
    );
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

/** GET /requests/fulfilment-queue — the tenant's IT Admin fulfilment queue. */
export async function fulfilmentQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const tab = fulfilmentQueueTabSchema.parse(req.query.tab ?? 'open');
    const dto = await fulfilmentService.getFulfilmentQueue(req.user!.tenantId!, tab);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

/** POST /requests/:id/claim — claim an approved IT request for fulfilment. */
export async function claim(req: Request, res: Response, next: NextFunction) {
  try {
    await fulfilmentService.claimRequest(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
