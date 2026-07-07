import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as enterpriseProfileController from './enterprise-profile.controller.js';

/** Self-service company details for the tenant's own Enterprise Admin — System Admin has no write access here. */
export const enterpriseProfileRouter: Router = Router();

enterpriseProfileRouter.use(requireAuth, requireEnterpriseAdmin);
enterpriseProfileRouter.get('/', enterpriseProfileController.get);
enterpriseProfileRouter.put('/', enterpriseProfileController.update);
