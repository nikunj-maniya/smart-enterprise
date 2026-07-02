import type { Request, Response, NextFunction } from 'express';
import * as enterprisesService from './enterprises.service.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await enterprisesService.listEnterprises());
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
