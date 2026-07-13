import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as leaveBalancesController from './leave-balances.controller.js';

export const leaveBalancesRouter: Router = Router();

leaveBalancesRouter.get('/me', requireAuth, leaveBalancesController.me);
