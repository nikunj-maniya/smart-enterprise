import type { Request, Response, NextFunction } from 'express';
import * as leaveBalancesService from './leave-balances.service.js';

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await leaveBalancesService.getMyLeaveBalances(req.user!.tenantId!, req.user!.id));
  } catch (err) {
    next(err);
  }
}
