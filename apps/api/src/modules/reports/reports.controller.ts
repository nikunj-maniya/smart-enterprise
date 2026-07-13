import type { Request, Response, NextFunction } from 'express';
import { reportRangeQuerySchema } from '@se/shared';
import * as reportsService from './reports.service.js';

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportRangeQuerySchema.parse(req.query);
    const viewer = { id: req.user!.id, roles: req.user!.roles };
    res.json(await reportsService.getSummary(req.user!.tenantId!, viewer, query));
  } catch (err) {
    next(err);
  }
}

/** GET /reports/export — CSV only (Excel deferred; CSV opens natively in Excel). */
export async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportRangeQuerySchema.parse(req.query);
    const viewer = { id: req.user!.id, roles: req.user!.roles };
    const csv = await reportsService.exportAbsencesCsv(req.user!.tenantId!, viewer, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="absences-${query.from}-to-${query.to}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
