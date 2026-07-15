import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as projectsController from './projects.controller.js';

export const projectsRouter: Router = Router();

// Read access is shared with everyone `resolveAbsenceScope` grants absence visibility to (the
// Absence Calendar's project filter needs this); mutations stay Enterprise-Admin only.
const ABSENCE_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

projectsRouter.use(requireAuth);
projectsRouter.get('/', requireAnyRole(ABSENCE_VIEWER_ROLES), projectsController.list);
projectsRouter.post('/', requireEnterpriseAdmin, projectsController.create);
projectsRouter.put('/:id', requireEnterpriseAdmin, projectsController.update);
projectsRouter.delete('/:id', requireEnterpriseAdmin, projectsController.remove);
