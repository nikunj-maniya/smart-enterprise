import type { Request, Response, NextFunction } from 'express';
import { platformUsersQuerySchema } from '@se/shared';
import * as usersService from './users.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = platformUsersQuerySchema.parse(req.query);
    res.json(await usersService.listPlatformUsers(query));
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await usersService.adminResetPassword(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
}
