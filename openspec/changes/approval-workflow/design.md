## Context

Builds on `form-engine` (submission pipeline, status lifecycle, `RequestApprover`/`RequestStatusHistory` tables) and `org-masters` (roles and user status). PRD §8 governs semantics; the design's Approver persona screens (Approvals queue, reject modal, request-detail drawer) govern UI. Leave/WFH conditional HR sign-off and Visitor/IT Process Head stages are configuration consumed here, not new engine features per form.

## Goals / Non-Goals

**Goals:**
- One decision engine every request type flows through: snapshot → parallel votes → outcome.
- Escalation as configuration (matrix), not code paths per role.
- The approver's entire working surface (queue + drawer) matching the design exactly.

**Non-Goals:**
- Notifications delivery (events are emitted; `notifications-inapp` renders them).
- HR Sign-offs screen (a filtered view owned by `leave-wfh-requests`).
- Slack Approve/Reject buttons (Phase 3, `slack-integration`) — the decision API is built so Slack can call it.

## Decisions

- **Snapshot at submit, resolve at submit** — approver resolution (including self-approval escalation) happens once, inside the submission transaction; the engine thereafter reads only `RequestApprover` rows. Alternative — resolving approvers at decision time — rejected: org changes would mutate in-flight requests, violating §8.2.
- **Outcome evaluation inside the decision transaction** — recording a decision and evaluating the outcome (all-approved → Approved; any-reject → Rejected) happen atomically with the request row locked, serializing concurrent last-approver races so exactly one outcome transition fires.
- **Escalation matrix as a tenant-scoped table (`role_id → target_role_id`, action window)** seeded with PRD defaults. Alternative — hardcoded role names — rejected: roles are tenant-defined in `org-masters`.
- **Escalation reassigns the existing `RequestApprover` row** (updates approver, appends audit trail + chain annotation) rather than adding a second row — keeps "all must approve" arithmetic trivial and the chain UI honest about who currently holds the stage.
- **Auto-escalation via a BullMQ sweep job** (hourly) checking pending approvals against approved-leave overlap, deactivated users, and the tenant action window. Alternative — per-approval delayed jobs — rejected: leave can be approved after the job is scheduled; a sweep always sees current truth.
- **Comment is a non-terminal action** — stored on the approver row and surfaced in the drawer; it never changes request status (§8.5's "request changes" stays a comment in v1).
- **Decision API is transport-agnostic** — a service function called by the REST route now and the Slack interaction handler in Phase 3, so authorization (is this user this request's pending approver?) lives in exactly one place.

## Risks / Trade-offs

- [Escalation target also unavailable → escalation loop] → the sweep follows the matrix at most one hop per run and never assigns to the requester or an inactive user; if no valid target exists it flags the approval for Enterprise Admin attention instead of looping.
- [Concurrent approve + withdraw] → both go through the status-lifecycle locked transition; the loser re-reads state and fails its gate cleanly.
- [Queue counts drift from truth under load] → tab counts come from the same filtered query as the list (no cached counters).
- [Reassigned approver loses context] → the chain shows the escalation annotation (from whom, why), and the original approver keeps read visibility of the request.

## Open Questions

<!-- none — action-window default (48h) and sweep cadence are tenant-configurable settings with seeded defaults -->
