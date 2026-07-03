import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as departmentsController from './departments.controller.js';

export const departmentsRouter: Router = Router();

departmentsRouter.use(requireAuth, requireEnterpriseAdmin);
departmentsRouter.get('/', departmentsController.list);
departmentsRouter.post('/', departmentsController.create);
departmentsRouter.put('/:id', departmentsController.update);
