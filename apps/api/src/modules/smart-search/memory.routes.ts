import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as memoryController from './memory.controller.js';

/** Self-service long-term-memory management (privacy requirement: view/edit/delete what's been
 *  remembered about you). Every route is tenant+user scoped inside memory.service.ts, never just
 *  by an id in the URL — no separate role check needed, same reasoning as profile.routes.ts. */
export const smartSearchMemoryRouter: Router = Router();

smartSearchMemoryRouter.use(requireAuth);
smartSearchMemoryRouter.get('/', memoryController.list);
smartSearchMemoryRouter.patch('/:id', memoryController.update);
smartSearchMemoryRouter.delete('/:id', memoryController.remove);
