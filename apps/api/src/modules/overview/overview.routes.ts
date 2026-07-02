import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as overviewController from './overview.controller.js';

export const overviewRouter: Router = Router();

overviewRouter.get('/', requireAuth, requireSystemAdmin, overviewController.get);
