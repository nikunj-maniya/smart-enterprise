import type { Request, Response, NextFunction } from 'express';
import { enterprisesQuerySchema } from '@se/shared';
import * as enterprisesService from './enterprises.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = enterprisesQuerySchema.parse(req.query);
    res.json(await enterprisesService.listEnterprises(query));
  } catch (err) {
    next(err);
  }
}

export async function suspend(req: Request, res: Response, next: NextFunction) {
  try {
    await enterprisesService.suspendEnterprise(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function reactivate(req: Request, res: Response, next: NextFunction) {
  try {
    await enterprisesService.reactivateEnterprise(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
