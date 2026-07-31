import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import * as registrationsController from './registrations.controller.js';

export const registrationsRouter: Router = Router();

// Public, unauthenticated submission — same abuse profile as /auth/* and /public/self-registration,
// so it gets the tighter limiter rather than sharing the coarse global one (finding #3).
registrationsRouter.post('/', authRateLimiter, registrationsController.submit);
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
