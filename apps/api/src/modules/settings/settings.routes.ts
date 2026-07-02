import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as settingsController from './settings.controller.js';

export const settingsRouter: Router = Router();

settingsRouter.get('/', requireAuth, requireSystemAdmin, settingsController.get);
settingsRouter.put('/', requireAuth, requireSystemAdmin, settingsController.update);
