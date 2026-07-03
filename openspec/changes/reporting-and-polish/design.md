## Context

The final roadmap phase (PRD §15 Phase 4, §17.4). Everything here was explicitly deferred from earlier phases: dashboards/exports (resolved D — "audit log in v1; dashboards/export in Phase 4"), visitor signatures + object storage, half-day specific dates, notification preferences, PWA. Authored early only to complete the backlog; expect re-slicing before implementation.

## Goals / Non-Goals

**Goals:**
- Reporting and exports that inherit — never bypass — the §11A visibility rules.
- Introduce object storage (MinIO) for the first binary artifact (signatures).
- Close the two UX deferrals: half-day specific dates, notification preferences.

**Non-Goals:**
- Advanced BI/warehouse analytics; external reporting tools.
- Email as a notification channel (still out of scope unless separately decided).
- Native mobile apps (PWA only, per PRD non-goals).

## Decisions

- **Exports reuse the visibility policy module** from `absence-visibility` — an export is just a serialized query result, so it flows through the same `where`/`select` shaping; no parallel report-side permission code.
- **MinIO via signed URLs only** — signatures are written by the API and read through short-lived signed URLs; nothing in the bucket is public (PRD §13 "signed file/signature storage").
- **Half-day dates extend, not replace, the balance math** — deduction still sums per-date weights (1 or 0.5), so the `leave-balances` engine changes shape only in input, not in its atomicity contract.
- **Preferences are a delivery-time filter** in the notification dispatcher, with tenant policy able to mark types mandatory — the trigger matrix itself does not change.

## Risks / Trade-offs

- [This change is a Phase-4 grab-bag] → acknowledged; re-slice into reporting / preferences / signatures changes at Phase-4 planning before implementation.
- [Export of large ranges strains the API] → stream exports and cap ranges; move to a BullMQ job + download link if needed.
- [New MinIO dependency broadens the deploy surface] → compose-managed like postgres/redis; kept optional until this change starts.

## Open Questions

- Which dashboard tiles matter most (HR vs Management vs Admin) — decide at Phase-4 planning with real usage data.
