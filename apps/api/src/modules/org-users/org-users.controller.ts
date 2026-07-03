import type { Request, Response, NextFunction } from 'express';
import * as orgUsersService from './org-users.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgUsersService.listOrgUsersForPicker(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}
