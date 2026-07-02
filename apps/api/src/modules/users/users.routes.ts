import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as usersController from './users.controller.js';

export const usersRouter: Router = Router();

usersRouter.get('/', requireAuth, requireSystemAdmin, usersController.list);
