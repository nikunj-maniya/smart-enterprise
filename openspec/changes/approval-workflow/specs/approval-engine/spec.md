## ADDED Requirements

### Requirement: Approver set snapshotted at submission
The approvers the requester selected on the form SHALL be resolved and written as `RequestApprover` rows (approver, role context, pending decision) when the request is submitted, and that snapshot SHALL govern the request for its whole life — later role, project, or org changes never alter an in-flight request's approver set.

#### Scenario: Snapshot written on submit
- **WHEN** a leave request is submitted with a PM, a Tech Lead, and (duration > 2 days) an HR Head selected
- **THEN** one pending `RequestApprover` row per selected person is created with their role context

#### Scenario: Snapshot immune to org changes
- **WHEN** a snapshotted approver later loses the PM role or leaves the project
- **THEN** they remain the required approver on the in-flight request and can still decide it

### Requirement: Parallel approval — all must approve
A request SHALL become Approved only when every snapshotted approver has approved; approvers SHALL be able to act independently and in any order.

#### Scenario: Last approval approves the request
- **WHEN** the final pending approver approves
- **THEN** the request transitions to Approved

#### Scenario: Partial approval keeps it pending
- **WHEN** some but not all approvers have approved and none rejected
- **THEN** the request stays in Pending Approval

### Requirement: Any rejection rejects
A single rejection SHALL transition the request to Rejected regardless of other approvers' decisions, and a rejection SHALL always carry a reason.

#### Scenario: One rejection ends the request
- **WHEN** any snapshotted approver rejects with a reason
- **THEN** the request transitions to Rejected and remaining approvals are moot

#### Scenario: Reason is mandatory
- **WHEN** an approver submits a rejection without a reason
- **THEN** the API refuses it

### Requirement: Decisions are recorded and audit-logged
Each Approve/Reject/Comment SHALL be recorded on the approver's `RequestApprover` row (decision, timestamp, comment) and written to the immutable audit log; an approver SHALL NOT decide the same request twice, and only a snapshotted approver may decide.

#### Scenario: Non-approver is blocked
- **WHEN** a user who is not in the request's snapshot attempts a decision
- **THEN** the API refuses with an authorization error

#### Scenario: Double decision is blocked
- **WHEN** an approver who already decided attempts a second decision
- **THEN** the API refuses and the original decision stands
