import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as rolesController from './roles.controller.js';

export const rolesRouter: Router = Router();

rolesRouter.use(requireAuth, requireEnterpriseAdmin);
rolesRouter.get('/', rolesController.list);
rolesRouter.post('/', rolesController.create);
rolesRouter.put('/:id', rolesController.update);
