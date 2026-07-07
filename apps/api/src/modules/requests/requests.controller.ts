import type { Request, Response, NextFunction } from 'express';
import { createRequestSchema } from '@se/shared';
import * as requestsService from './requests.service.js';
import { PayloadValidationError } from './requests.service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createRequestSchema.parse(req.body);
    const dto = await requestsService.createRequest(req.user!.tenantId!, req.user!.id, input);
    res.status(201).json(dto);
  } catch (err) {
    if (err instanceof PayloadValidationError) {
      return res.status(400).json({ error: 'Validation failed', fields: err.fields });
    }
    next(err);
  }
}
