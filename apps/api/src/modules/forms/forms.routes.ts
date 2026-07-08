import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as formsController from './forms.controller.js';

export const formsRouter: Router = Router();

formsRouter.get('/', requireAuth, formsController.list);
// Admin builder CRUD — registered before `/:key` so `/drafts...` isn't swallowed by that param route.
formsRouter.get('/drafts', requireAuth, requireEnterpriseAdmin, formsController.listBuilder);
formsRouter.post('/drafts', requireAuth, requireEnterpriseAdmin, formsController.createDraft);
formsRouter.get('/drafts/:key', requireAuth, requireEnterpriseAdmin, formsController.getDraft);
formsRouter.put('/drafts/:key', requireAuth, requireEnterpriseAdmin, formsController.saveDraft);
formsRouter.post('/drafts/:key/publish', requireAuth, requireEnterpriseAdmin, formsController.publishDraft);
formsRouter.post('/drafts/:key/start', requireAuth, requireEnterpriseAdmin, formsController.startDraft);
formsRouter.get('/:key', requireAuth, formsController.getByKey);
formsRouter.post('/:key/publish', requireAuth, requireEnterpriseAdmin, formsController.publish);
