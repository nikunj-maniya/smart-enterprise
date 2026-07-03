## ADDED Requirements

### Requirement: Approvals queue screen
An approver SHALL see a queue of requests routed to them, split into "Awaiting you" and "Decided" tabs (with counts), each request shown as a card with requester, title, team/dates/submitted metadata, reason, and the parallel approval chain (per-approver status badges) — matching the design's Approvals screen including the empty state.

#### Scenario: Pending request appears in the queue
- **WHEN** a request whose snapshot includes the approver is pending their decision
- **THEN** it appears under "Awaiting you" with Approve and Reject actions

#### Scenario: Decided tab shows outcome
- **WHEN** the approver has decided a request
- **THEN** it moves to "Decided" showing their decision badge and, for rejections, the reason

#### Scenario: Queue is scoped to the approver
- **WHEN** an approver opens the queue
- **THEN** only requests snapshotted to them are listed — never other users' queues or other tenants' requests

### Requirement: Role-context toggle
An approver holding multiple approving role contexts (e.g. Project Manager and Process Head) SHALL be able to switch the queue between those contexts per the design's "Approving as" toggle.

#### Scenario: Switching context filters the queue
- **WHEN** the approver switches "Approving as" from Project Manager to Process Head
- **THEN** the queue shows only requests where their snapshot row carries that role context

### Requirement: Reject requires a reason via modal
Choosing Reject SHALL open the design's reject modal requiring a reason before the decision is submitted.

#### Scenario: Reject flow
- **WHEN** the approver clicks Reject and submits the modal with a reason
- **THEN** the rejection (with reason) is recorded and the card reflects Rejected

### Requirement: Request detail drawer
Any request row/card a user is entitled to open SHALL present the design's detail drawer: dates/details from the payload, the parallel approval chain with per-approver status badges, and a Withdraw button visible only while the requester may still withdraw.

#### Scenario: Drawer shows the live chain
- **WHEN** a user opens a request's detail drawer
- **THEN** every snapshotted approver appears with their current decision state

#### Scenario: Withdraw appears only while allowed
- **WHEN** the viewer is the requester and no approver has acted
- **THEN** the drawer shows Withdraw; after any decision it does not
