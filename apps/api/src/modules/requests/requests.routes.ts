import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as requestsController from './requests.controller.js';

export const requestsRouter: Router = Router();

requestsRouter.post('/', requireAuth, requestsController.create);
