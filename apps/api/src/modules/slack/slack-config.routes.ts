import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as slackConfigController from './slack-config.controller.js';

export const slackConfigRouter: Router = Router();

slackConfigRouter.use(requireAuth, requireEnterpriseAdmin);
slackConfigRouter.get('/', slackConfigController.get);
slackConfigRouter.post('/connect', slackConfigController.connect);
slackConfigRouter.post('/disconnect', slackConfigController.disconnect);
slackConfigRouter.post('/test', slackConfigController.test);
slackConfigRouter.put('/settings', slackConfigController.updateSettings);
