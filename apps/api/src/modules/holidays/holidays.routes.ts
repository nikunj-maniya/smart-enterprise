import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth } from '../../middleware/auth.js';
import * as holidaysController from './holidays.controller.js';

export const holidaysRouter: Router = Router();

// `manage_holidays` holders (attendance-report design decision) — viewing stays open to the tenant.
const HOLIDAY_MANAGER_ROLES = [SystemRoleKey.HrHead, SystemRoleKey.EnterpriseAdmin];

holidaysRouter.use(requireAuth);
holidaysRouter.get('/', holidaysController.list);
holidaysRouter.post('/', requireAnyRole(HOLIDAY_MANAGER_ROLES), holidaysController.create);
holidaysRouter.put('/:id', requireAnyRole(HOLIDAY_MANAGER_ROLES), holidaysController.update);
holidaysRouter.delete('/:id', requireAnyRole(HOLIDAY_MANAGER_ROLES), holidaysController.remove);
