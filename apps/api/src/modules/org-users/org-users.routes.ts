import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as orgUsersController from './org-users.controller.js';

export const orgUsersRouter: Router = Router();

orgUsersRouter.get('/', requireAuth, requireEnterpriseAdmin, orgUsersController.list);
