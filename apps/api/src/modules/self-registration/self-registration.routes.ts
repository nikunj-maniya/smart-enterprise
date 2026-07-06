import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as controller from './self-registration.controller.js';

/** Enterprise-Admin link management, mounted at /self-registration. */
export const selfRegistrationRouter: Router = Router();
selfRegistrationRouter.use(requireAuth, requireEnterpriseAdmin);
selfRegistrationRouter.get('/', controller.getLink);
selfRegistrationRouter.post('/', controller.generate);
selfRegistrationRouter.delete('/', controller.revoke);

/** Public token-gated endpoints, mounted at /public/self-registration. */
export const publicSelfRegistrationRouter: Router = Router();
publicSelfRegistrationRouter.get('/:token', controller.publicInfo);
publicSelfRegistrationRouter.post('/:token', controller.publicRegister);
