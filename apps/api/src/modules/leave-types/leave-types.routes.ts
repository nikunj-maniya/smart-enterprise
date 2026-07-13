import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as leaveTypesController from './leave-types.controller.js';

export const leaveTypesRouter: Router = Router();

leaveTypesRouter.use(requireAuth, requireEnterpriseAdmin);
leaveTypesRouter.get('/', leaveTypesController.list);
leaveTypesRouter.get('/absence-cap', leaveTypesController.getAbsenceCap);
leaveTypesRouter.put('/absence-cap', leaveTypesController.updateAbsenceCap);
leaveTypesRouter.put('/:id', leaveTypesController.update);
