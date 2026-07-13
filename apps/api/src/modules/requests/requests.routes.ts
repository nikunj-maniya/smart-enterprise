import { Router } from 'express';
import { requireAuth, requireItAdmin } from '../../middleware/auth.js';
import * as requestsController from './requests.controller.js';

export const requestsRouter: Router = Router();

requestsRouter.get('/', requireAuth, requestsController.listMine);
requestsRouter.get('/approvals', requireAuth, requestsController.listApprovals);
requestsRouter.get('/fulfilment-queue', requireAuth, requireItAdmin, requestsController.fulfilmentQueue);
requestsRouter.post('/', requireAuth, requestsController.create);
requestsRouter.get('/:id', requireAuth, requestsController.getById);
requestsRouter.post('/:id/transitions', requireAuth, requestsController.transition);
requestsRouter.post('/:id/decisions', requireAuth, requestsController.decide);
requestsRouter.post('/:id/claim', requireAuth, requireItAdmin, requestsController.claim);
