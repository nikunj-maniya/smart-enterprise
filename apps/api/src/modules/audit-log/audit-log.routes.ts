import { Router } from 'express';
import { requireAuth, requireSystemAdmin } from '../../middleware/auth.js';
import * as auditLogController from './audit-log.controller.js';

export const auditLogRouter: Router = Router();

auditLogRouter.get('/', requireAuth, requireSystemAdmin, auditLogController.list);
