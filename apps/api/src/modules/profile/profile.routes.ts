import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as profileController from './profile.controller.js';

/** Self-service profile for any authenticated user. Password change reuses /auth/change-password. */
export const profileRouter: Router = Router();

profileRouter.use(requireAuth);
profileRouter.get('/', profileController.get);
profileRouter.put('/', profileController.update);
