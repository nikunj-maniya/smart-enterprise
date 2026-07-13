import type { GlobalSearchResponse } from '@se/shared';
import type { AuthedUser } from '../../middleware/auth.js';
import { SYSTEM_ADMIN_SEARCHERS, TENANT_SEARCHERS } from './search.searchers.js';

/**
 * GET /search — fans out to every searcher registered for the caller's tier (System Admin vs.
 * tenant user), runs them concurrently, and returns only the non-empty groups. Query below the
 * 2-char minimum the overlay enforces client-side is still accepted here (the endpoint doesn't
 * re-enforce it) but simply won't match much against `contains`.
 */
export async function globalSearch(viewer: AuthedUser, q: string): Promise<GlobalSearchResponse> {
  const searchers = viewer.isSystemAdmin ? SYSTEM_ADMIN_SEARCHERS : TENANT_SEARCHERS;
  const groups = await Promise.all(searchers.map((searcher) => searcher(viewer, q)));
  return { groups: groups.filter((g): g is NonNullable<typeof g> => g !== null) };
}
