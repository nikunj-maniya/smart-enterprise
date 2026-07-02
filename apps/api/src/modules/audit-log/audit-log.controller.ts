import type { Request, Response, NextFunction } from 'express';
import { auditLogQuerySchema } from '@se/shared';
import * as auditLogService from './audit-log.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = auditLogQuerySchema.parse(req.query);
    res.json(await auditLogService.listAuditLog(query));
  } catch (err) {
    next(err);
  }
}
