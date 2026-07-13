import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as searchController from './search.controller.js';

export const searchRouter: Router = Router();

searchRouter.use(requireAuth);
searchRouter.get('/', searchController.search);
