## ADDED Requirements

### Requirement: Configurable escalation matrix
Each tenant SHALL have a configurable escalation matrix mapping a role to its escalation target role (defaults: PM/TL/Manager → HR Head; HR Head → Enterprise Admin), used for both self-approval prevention and unavailable-approver escalation.

#### Scenario: Matrix is tenant-configurable
- **WHEN** an Enterprise Admin updates the escalation target for a role
- **THEN** subsequent escalations for that tenant follow the new mapping while other tenants are unaffected

### Requirement: No self-approval
A requester SHALL never appear in their own approver set; any stage that would resolve to the requester SHALL escalate to the matrix target at submission time.

#### Scenario: Approver submits their own request
- **WHEN** a PM submits a leave request where they would be their own approver
- **THEN** that stage resolves to the escalation target (e.g. HR Head) instead, and the PM is not in the snapshot

#### Scenario: HR Head's own request
- **WHEN** an HR Head submits a request requiring HR sign-off
- **THEN** the sign-off resolves to the configured higher authority (e.g. Enterprise Admin)

### Requirement: Auto-escalation of stalled or unavailable approvals
A pending approval SHALL auto-escalate to the matrix target when its approver is on approved leave covering today, has been deactivated, or has not acted within the tenant-configured window; the original approver and the requester SHALL be notified of the escalation.

#### Scenario: Approver on approved leave
- **WHEN** the escalation sweep finds a pending approval whose approver has approved leave covering today
- **THEN** the approval reassigns to the escalation target and both the original approver and requester are notified

#### Scenario: Approver inactive past the window
- **WHEN** a pending approval is older than the tenant's configured action window
- **THEN** it escalates per the matrix with the same notifications

#### Scenario: Escalation is recorded
- **WHEN** any auto-escalation occurs
- **THEN** the reassignment (from-approver, to-approver, cause) is written to the audit log and visible in the request's approval chain
