import type { Request, Response, NextFunction } from 'express';
import { directoryProjectsQuerySchema, directoryUsersQuerySchema } from '@se/shared';
import * as directoryService from './directory.service.js';

export async function users(req: Request, res: Response, next: NextFunction) {
  try {
    const query = directoryUsersQuerySchema.parse(req.query);
    const rows = await directoryService.searchDirectoryUsers(req.user!.tenantId!, query);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
}

export async function projects(req: Request, res: Response, next: NextFunction) {
  try {
    const query = directoryProjectsQuerySchema.parse(req.query);
    const rows = await directoryService.searchDirectoryProjects(req.user!.tenantId!, query);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
}
