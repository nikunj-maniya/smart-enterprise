import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as registrationsController from './registrations.controller.js';

export const registrationsRouter: Router = Router();

registrationsRouter.post('/', registrationsController.submit);
registrationsRouter.get('/', requireAuth, requireSystemAdmin, registrationsController.list);
registrationsRouter.post(
  '/:id/accept',
  requireAuth,
  requireSystemAdmin,
  registrationsController.accept,
);
registrationsRouter.post(
  '/:id/reject',
  requireAuth,
  requireSystemAdmin,
  registrationsController.reject,
);
