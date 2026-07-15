import type { Request, Response, NextFunction } from 'express';
import { attendanceReportQuerySchema, reportRangeQuerySchema } from '@se/shared';
import * as reportsService from './reports.service.js';
import * as attendanceService from './attendance.service.js';

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

export async function attendance(req: Request, res: Response, next: NextFunction) {
  try {
    const query = attendanceReportQuerySchema.parse(req.query);
    res.json(await attendanceService.getAttendanceReport(req.user!.tenantId!, query));
  } catch (err) {
    next(err);
  }
}

export async function attendanceExportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const query = attendanceReportQuerySchema.parse(req.query);
    const csv = await attendanceService.exportAttendanceCsv(req.user!.tenantId!, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${query.month}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
