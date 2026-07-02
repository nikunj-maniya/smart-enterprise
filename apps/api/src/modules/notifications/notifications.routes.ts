import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as notificationsController from './notifications.controller.js';

export const notificationsRouter: Router = Router();

notificationsRouter.get('/', requireAuth, notificationsController.list);
notificationsRouter.post('/:id/read', requireAuth, notificationsController.markRead);
notificationsRouter.post('/read-all', requireAuth, notificationsController.markAllRead);
