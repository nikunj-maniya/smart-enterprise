import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../lib/http-error.js';
import * as frontDeskController from './front-desk.controller.js';

export const frontDeskRouter: Router = Router();

/** Front-desk access is a permission on existing roles, not a dedicated role (design.md, a PRD
 *  locked decision) — approximated here by the same two roles the Visitor status model already
 *  gates check-in/out to (Enterprise Admin, HR Head), since no permission-enforcement
 *  infrastructure exists elsewhere in this codebase to check an arbitrary role's permission set. */
function requireFrontDeskAccess(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) {
  const allowed: string[] = [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead];
  if (!req.user?.roles.some((r) => allowed.includes(r))) {
    return next(new HttpError(403, 'Front Desk access required'));
  }
  next();
}

frontDeskRouter.use(requireAuth, requireFrontDeskAccess);
frontDeskRouter.get('/today', frontDeskController.today);
frontDeskRouter.post('/:requestId/check-in', frontDeskController.checkIn);
frontDeskRouter.get('/:requestId/signature-url', frontDeskController.signatureUrl);
