import type { Request, Response, NextFunction } from 'express';
import { createRequestSchema, transitionRequestSchema } from '@se/shared';
import * as requestsService from './requests.service.js';
import * as transitionsService from './transitions.service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createRequestSchema.parse(req.body);
    const dto = await requestsService.createRequest(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
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
