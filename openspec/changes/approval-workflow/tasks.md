## 1. Approver Snapshot

- [ ] 1.1 Resolve selected approvers into `RequestApprover` rows inside the submission transaction (role context per §8.2) _(Slice 1)_
- [ ] 1.2 Self-approval check at resolution: requester-as-approver stages escalate per matrix before snapshot _(Slice 1)_

## 2. Decision Engine

- [ ] 2.1 Decision service: authorize snapshotted approver, record Approve/Reject(+reason)/Comment, block double decisions _(Slice 2)_
- [ ] 2.2 Outcome evaluation in the same locked transaction: all-approved → Approved, any-reject → Rejected, else stay pending _(Slice 2)_
- [ ] 2.3 Audit-log every decision and outcome transition; emit events for notifications _(Slice 2)_
- [ ] 2.4 REST routes over the transport-agnostic decision service _(Slice 2)_

## 3. Escalation

- [ ] 3.1 Escalation-matrix table + seeded defaults (PM/TL/Manager → HR Head; HR Head → Enterprise Admin) + admin config API _(Slice 3)_
- [ ] 3.2 BullMQ sweep: escalate pending approvals on approved-leave overlap, deactivated approver, or action-window timeout — one hop, loop-safe, notifying original approver + requester _(Slice 4)_
- [ ] 3.3 Reassignment audit trail + chain annotation (from, to, cause) _(Slice 4)_

## 4. Approvals Queue (web)

- [ ] 4.1 Queue screen: Awaiting-you/Decided tabs with counts, request cards with approval-chain avatar chips + status badges, empty state — per design _(Slice 5)_
- [ ] 4.2 "Approving as" role-context toggle filtering by snapshot role context _(Slice 5)_
- [ ] 4.3 Approve action + Reject modal (reason required) wired to the decision API _(Slice 5)_

## 5. Request Detail Drawer (web)

- [ ] 5.1 Shared drawer: dates/details from payload, parallel chain with per-approver badges, escalation annotations — per design _(Slice 6)_
- [ ] 5.2 Conditional Withdraw button honoring the withdraw-lock rule _(Slice 6)_

## 6. Verify

- [ ] 6.1 Two-approver request: one approves → still pending; second approves → Approved
- [ ] 6.2 Any rejection (with reason) → Rejected; reason-less reject and non-snapshot/double decisions refused
- [ ] 6.3 Approver's own request never includes them; HR Head's request escalates to the configured authority
- [ ] 6.4 Sweep escalates an on-leave approver's pending item once, with notifications and audit trail
- [ ] 6.5 Queue tabs, role toggle, chain badges, and drawer Withdraw visibility match the design prototype
