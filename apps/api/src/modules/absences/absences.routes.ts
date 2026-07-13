import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as absencesController from './absences.controller.js';

export const absencesRouter: Router = Router();

absencesRouter.use(requireAuth);
absencesRouter.get('/', absencesController.list);
absencesRouter.get('/over-cap', absencesController.overCap);
