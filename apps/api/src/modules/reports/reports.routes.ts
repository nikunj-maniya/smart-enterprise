import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as reportsController from './reports.controller.js';

export const reportsRouter: Router = Router();

reportsRouter.use(requireAuth);
reportsRouter.get('/summary', reportsController.summary);
reportsRouter.get('/export', reportsController.exportCsv);
