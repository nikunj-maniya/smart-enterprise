## Why

Requests can be submitted (form-engine) but nobody can approve them: PRD §8's parallel approval, approver snapshotting, and escalation rules have no implementation, and approvers have no screen. This change delivers the decision half of every request journey — without it Leave/WFH/Visitor/IT flows dead-end at "Pending Approval".

## What Changes

- Add the **parallel approval engine**: every required approver must approve; any single rejection rejects the request; approvers act independently in any order (§8.1).
- Add **approver resolution + snapshot**: the approvers selected on the form (PM/BA, project-scoped Tech Lead, HR Head when > 2 days, Process Head for Visitor/IT) are resolved and written as `RequestApprover` rows at submission, so later org changes never affect in-flight requests (§8.2–§8.3).
- Add **approver actions**: Approve, Reject (reason required), and Comment — each audit-logged and each driving the status lifecycle (§8.5).
- Add the per-tenant **escalation matrix** (role → approver-role): an approver-as-requester never self-approves — that stage escalates per the matrix; HR Head's own requests go to the configured higher authority (§8.4).
- Add **auto-escalation**: a pending approval held by an approver who is on approved leave, is deactivated, or hasn't acted within the configured window escalates to the matrix target, notifying the original approver and requester (§8.4.1).
- Build the **Approvals queue** screen (role-context toggle, Awaiting-you/Decided tabs, approval-chain cards, reject-reason modal, empty state) and the shared **Request Detail drawer** (chain view, conditional Withdraw) per the design.

## Capabilities

### New Capabilities
- `approval-engine`: parallel voting, approver snapshot, decision recording, and outcome resolution.
- `escalation`: the per-tenant escalation matrix, self-approval prevention, and unavailable/timeout auto-escalation.
- `approvals-queue`: the approver-facing queue UI and the shared request-detail drawer.

### Modified Capabilities
<!-- none -->

## Impact

- Depends on `form-engine` (submission, status lifecycle, `RequestApprover` rows) and `org-masters` (roles resolve approvers; user status feeds auto-escalation).
- Adds decision APIs, an escalation-matrix config API, a BullMQ escalation sweep job, and the approver UI; emits events `notifications-inapp` will consume.
- `leave-wfh-requests`, `visitor-management`, and `it-requests` plug their forms into this engine unchanged.
