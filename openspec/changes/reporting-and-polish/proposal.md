## Why

Phase 4 of the PRD roadmap (§15) closes out the items deliberately deferred from earlier phases: reporting/exports, per-user notification preferences, visitor signatures with object storage, half-day specific dates, and PWA polish. This change is authored now so the full backlog is visible and sequenced; it is intentionally thin and SHOULD be re-sliced (likely split into 2–3 changes) when Phase 4 planning starts.

## What Changes

- Add **dashboards, CSV/Excel export, and basic analytics** over requests, approvals, and absences.
- Activate **per-user notification preferences** (the Profile page toggles become functional, within tenant policy).
- Add **visitor signature capture** stored in **MinIO object storage** (signed storage, consent kept with the visitor record) — deferred from v1 by PRD §7.3/§17.4.
- Upgrade **half-days from a count to specific-date selection** on Leave/WFH.
- Add a **PWA baseline** (installable, basic offline shell).

## Capabilities

### New Capabilities
- `reporting-dashboards`: dashboards, exports, analytics, and the PWA baseline.
- `notification-preferences`: per-user channel/type preferences within tenant policy.
- `visitor-signatures`: signature capture + object storage on the visitor flow.

### Modified Capabilities
- `leave-requests`: half-day handling upgrades from a count to specific-date selection.

## Impact

- **Depends on effectively everything**: `leave-wfh-requests` + `absence-visibility` (report/export sources), `notifications-inapp` (preferences), `visitor-management` (signatures), `slack-integration` (channel preferences). It must be the last change scheduled.
- Introduces the platform's first object-storage dependency (MinIO) and a new export pipeline.
- Half-day date selection touches the Leave/WFH wizards and the balance engine's 0.5-day math.
