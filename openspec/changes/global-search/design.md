## Context

The prototype's topbar search opens a modal overlay (`searchOpen`) with empty/no-results/result states. Confirmed in scope on 2026-07-03 even though the PRD text predates it. Search must respect the same visibility rules the owning pages enforce (§11A, tenant isolation §5).

## Goals / Non-Goals

**Goals:**
- One overlay, one endpoint, results strictly limited to what the caller could see by browsing.
- Extensible registry so later entity types (visitors, IT requests, forms) plug in.

**Non-Goals:**
- Full-text ranking/search infrastructure (Elasticsearch etc.) — v1 is `ILIKE` prefix/substring matching over indexed columns.
- Searching request payload contents or audit-log bodies.
- Saved searches / recent-search history.

## Decisions

- **Searcher registry, one endpoint** — each entity type registers a searcher (`match(query, viewer)` honoring role + tenant scope); the endpoint fans out to registered searchers and returns grouped, capped results (e.g. top 5 per type). New feature changes add searchers without touching the endpoint. Alternative (one UNION query) couples all visibility rules together.
- **Authorization by reuse** — each searcher calls the same tenant-scoped repository/guard path its owning page uses, so search can never see more than the page would show. This is the key isolation property.
- **Postgres `ILIKE` with pg_trgm indexes** — adequate at v1 scale and inside the §13 2s budget; a search infrastructure migration remains possible later behind the same endpoint.
- **Debounced query, min 2 chars** — the overlay queries after a short debounce and ignores single-character input to avoid scanning on every keystroke.

## Risks / Trade-offs

- [Search leaks via a mis-scoped searcher] → searchers must reuse existing guarded repositories; the verify checklist includes an explicit cross-tenant probe.
- [Result quality without ranking] → results grouped by type with a per-type cap; acceptable for v1's data volumes.
- [Shortcut collisions] → use the platform-conventional Cmd/Ctrl+K and keep the topbar click path as the universal fallback.

## Open Questions

<!-- none -->
