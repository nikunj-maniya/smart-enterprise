import type { Request, Response, NextFunction } from 'express';
import { createRequestSchema } from '@se/shared';
import * as requestsService from './requests.service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createRequestSchema.parse(req.body);
    const dto = await requestsService.createRequest(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}
