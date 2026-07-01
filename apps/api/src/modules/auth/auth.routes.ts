import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as authController from './auth.controller.js';

export const authRouter: Router = Router();

authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.post('/change-password', requireAuth, authController.changePassword);
