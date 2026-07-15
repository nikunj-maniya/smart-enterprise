import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as leaveTypesController from './leave-types.controller.js';

export const leaveTypesRouter: Router = Router();

// The Absence Calendar's subtitle reads the configured cap — shared with everyone
// `resolveAbsenceScope` grants absence visibility to; everything else stays Enterprise-Admin only.
const ABSENCE_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

leaveTypesRouter.use(requireAuth);
leaveTypesRouter.get('/', requireEnterpriseAdmin, leaveTypesController.list);
leaveTypesRouter.get('/absence-cap', requireAnyRole(ABSENCE_VIEWER_ROLES), leaveTypesController.getAbsenceCap);
leaveTypesRouter.put('/absence-cap', requireEnterpriseAdmin, leaveTypesController.updateAbsenceCap);
leaveTypesRouter.put('/:id', requireEnterpriseAdmin, leaveTypesController.update);
