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
