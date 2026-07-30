import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as conversationController from './conversation.controller.js';

/**
 * Smart Search thread history (list/resume/delete past conversations). Every route is
 * self-scoped to the caller (tenantId + userId from the authenticated request) — there is no
 * "view another user's threads" capability, even for admins.
 *
 * Mounted at `/smart-search/conversations` in src/index.ts (no `smartSearchRateLimiter` — this is
 * CRUD over already-persisted threads, never an LLM call). Paths below are relative to that base:
 *   GET    /smart-search/conversations      -> list (paginated)
 *   GET    /smart-search/conversations/:id  -> thread detail (messages, oldest first)
 *   POST   /smart-search/conversations      -> create a new, empty thread
 *   DELETE /smart-search/conversations/:id  -> delete a thread
 */
export const smartSearchConversationsRouter: Router = Router();

smartSearchConversationsRouter.use(requireAuth);
smartSearchConversationsRouter.get('/', conversationController.list);
smartSearchConversationsRouter.get('/:id', conversationController.get);
smartSearchConversationsRouter.post('/', conversationController.create);
smartSearchConversationsRouter.delete('/:id', conversationController.remove);
