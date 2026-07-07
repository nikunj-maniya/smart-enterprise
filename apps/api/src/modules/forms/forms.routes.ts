import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as formsController from './forms.controller.js';

export const formsRouter: Router = Router();

formsRouter.get('/', requireAuth, formsController.list);
formsRouter.get('/:key', requireAuth, formsController.getByKey);
formsRouter.post('/:key/publish', requireAuth, requireEnterpriseAdmin, formsController.publish);
