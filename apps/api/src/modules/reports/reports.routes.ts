import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth } from '../../middleware/auth.js';
import * as reportsController from './reports.controller.js';

export const reportsRouter: Router = Router();

// `view_attendance_report` holders — deliberately NOT HR Head (attendance-report design decision).
const ATTENDANCE_VIEWER_ROLES = [SystemRoleKey.Finance, SystemRoleKey.EnterpriseAdmin];

reportsRouter.use(requireAuth);
reportsRouter.get('/summary', reportsController.summary);
reportsRouter.get('/export', reportsController.exportCsv);
reportsRouter.get('/attendance', requireAnyRole(ATTENDANCE_VIEWER_ROLES), reportsController.attendance);
reportsRouter.get('/attendance/export', requireAnyRole(ATTENDANCE_VIEWER_ROLES), reportsController.attendanceExportCsv);
