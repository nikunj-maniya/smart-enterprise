import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as departmentsController from './departments.controller.js';

export const departmentsRouter: Router = Router();

// Read access is shared with everyone `resolveAbsenceScope` grants absence visibility to (the
// Absence Calendar's department filter needs this); mutations stay Enterprise-Admin only.
const ABSENCE_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

departmentsRouter.use(requireAuth);
departmentsRouter.get('/', requireAnyRole(ABSENCE_VIEWER_ROLES), departmentsController.list);
departmentsRouter.post('/', requireEnterpriseAdmin, departmentsController.create);
departmentsRouter.put('/:id', requireEnterpriseAdmin, departmentsController.update);
departmentsRouter.delete('/:id', requireEnterpriseAdmin, departmentsController.remove);
departmentsRouter.post('/:id/archive', requireEnterpriseAdmin, departmentsController.archive);
departmentsRouter.post('/:id/unarchive', requireEnterpriseAdmin, departmentsController.archive);
