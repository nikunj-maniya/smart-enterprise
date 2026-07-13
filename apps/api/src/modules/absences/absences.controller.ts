import type { Request, Response, NextFunction } from 'express';
import { absenceQuerySchema, overCapQuerySchema } from '@se/shared';
import * as absencesService from './absences.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = absenceQuerySchema.parse(req.query);
    const viewer = { id: req.user!.id, roles: req.user!.roles };
    res.json(await absencesService.listAbsences(req.user!.tenantId!, viewer, query));
  } catch (err) {
    next(err);
  }
}

export async function overCap(req: Request, res: Response, next: NextFunction) {
  try {
    const query = overCapQuerySchema.parse(req.query);
    const viewer = { id: req.user!.id, roles: req.user!.roles };
    res.json(await absencesService.getOverCapDays(req.user!.tenantId!, viewer, query));
  } catch (err) {
    next(err);
  }
}
