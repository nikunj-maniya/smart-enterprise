import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as escalationRulesController from './escalation-rules.controller.js';

export const escalationRulesRouter: Router = Router();

escalationRulesRouter.use(requireAuth, requireEnterpriseAdmin);
escalationRulesRouter.get('/', escalationRulesController.list);
escalationRulesRouter.put('/:id', escalationRulesController.update);
