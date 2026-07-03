## Context

PRD §11 defines in-app as the always-on channel (Slack optional per tenant, no email in v1). The design prototype shows the bell dropdown and a full Notifications Center page. The `Notification` entity exists from `setup-foundation`. Approval/request changes need a service to call — this change must land before or alongside them.

## Goals / Non-Goals

**Goals:**
- One notification writer that all feature code calls with typed events.
- Bell dropdown + Notifications Center matching the design.
- Push delivery within 5s; daily pending-approval reminders.

**Non-Goals:**
- Slack delivery and interactive buttons (`slack-integration`, Phase 3).
- Per-user notification preferences (Phase 4 — Profile toggles stay disabled).
- Email of any kind (not in v1).

## Decisions

- **Typed event catalog, single writer** — feature code calls `notify(event, recipients, payload)` with an event type from a shared enum; the writer persists rows and emits pushes. Alternatives (per-feature inserts) scatter the recipient/visibility rules; a catalog keeps templates and future channel fan-out (Slack) in one place.
- **Socket.IO room per user id** — the API emits to `user:<id>` on create; the web app joins its room after login and falls back to a 30s poll when the socket is down. Matches PRD §14's confirmed Socket.IO choice.
- **Reminder job in BullMQ** — one daily repeatable job scans pending `RequestApprover` rows, groups by approver, and writes a single summary notification each. Runs in the existing worker process (Redis already provisioned).
- **Recipient-scoped API** — list/mark-read endpoints filter by the JWT's user id and tenant; there is no admin listing of others' notifications in v1 (privacy per §11A).
- **Reminders are additive, not stateful** — the job doesn't dedupe against manual reads beyond one-per-day; simplest thing that satisfies "daily reminder".

## Risks / Trade-offs

- [Trigger call-sites live in later changes] → this change ships the service + UI wired to a first real trigger set only when `approval-workflow` lands; until then the center shows the empty state. Kept thin deliberately.
- [Socket auth] → the socket handshake validates the JWT the same way HTTP middleware does; an unauthenticated socket joins no room.
- [Notification volume growth] → payloads are small JSON; pagination on the center page and an index on `(user_id, read, created_at)` keep queries within the §13 2s budget.

## Open Questions

<!-- none -->
