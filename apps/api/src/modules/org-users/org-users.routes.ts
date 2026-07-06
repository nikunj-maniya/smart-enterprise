import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as orgUsersController from './org-users.controller.js';

export const orgUsersRouter: Router = Router();

orgUsersRouter.use(requireAuth, requireEnterpriseAdmin);
orgUsersRouter.get('/', orgUsersController.list);
orgUsersRouter.get('/options', orgUsersController.options);
orgUsersRouter.get('/stats', orgUsersController.stats);
orgUsersRouter.post('/', orgUsersController.create);
orgUsersRouter.put('/:id', orgUsersController.update);
orgUsersRouter.post('/:id/deactivate', orgUsersController.deactivate);
orgUsersRouter.post('/:id/reactivate', orgUsersController.reactivate);
orgUsersRouter.post('/:id/approve', orgUsersController.approve);
orgUsersRouter.post('/:id/reject', orgUsersController.reject);
orgUsersRouter.post('/:id/reset-password', orgUsersController.resetPassword);
