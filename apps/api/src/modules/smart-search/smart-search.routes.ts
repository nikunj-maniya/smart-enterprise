import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as smartSearchController from './smart-search.controller.js';

export const smartSearchRouter: Router = Router();

smartSearchRouter.use(requireAuth);
smartSearchRouter.post('/', smartSearchController.ask);
