import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as projectsController from './projects.controller.js';

export const projectsRouter: Router = Router();

projectsRouter.use(requireAuth, requireEnterpriseAdmin);
projectsRouter.get('/', projectsController.list);
projectsRouter.post('/', projectsController.create);
projectsRouter.put('/:id', projectsController.update);
