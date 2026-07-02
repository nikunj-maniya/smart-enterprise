import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as enterprisesController from './enterprises.controller.js';

export const enterprisesRouter: Router = Router();

enterprisesRouter.get('/', requireAuth, requireSystemAdmin, enterprisesController.list);
enterprisesRouter.post(
  '/:id/suspend',
  requireAuth,
  requireSystemAdmin,
  enterprisesController.suspend,
);
enterprisesRouter.post(
  '/:id/reactivate',
  requireAuth,
  requireSystemAdmin,
  enterprisesController.reactivate,
);
