import { Router } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, requireAuth } from '../../middleware/auth.js';
import * as documentSearchController from './document-search.controller.js';

/** Same two roles as `FRONT_DESK_VIEWER_ROLES` in smart-search.tools.ts — no dedicated "content
 *  admin" role exists yet, and these are the tenant's existing admin-ish roles. */
const DOCUMENT_INGEST_ROLES = [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead];

/**
 * Admin ingestion for the `search_docs` smart-search tool's RAG store (`document_chunks` — see
 * migration 20260806090000_document_chunks). Mounted at `/smart-search/documents` in src/index.ts,
 * same base-path convention as conversation.routes.ts/memory.routes.ts.
 *   POST /smart-search/documents -> chunk + embed + store `content` under `source`
 */
export const documentSearchRouter: Router = Router();

documentSearchRouter.use(requireAuth);
documentSearchRouter.post('/', requireAnyRole(DOCUMENT_INGEST_ROLES), documentSearchController.ingest);
