## ADDED Requirements

### Requirement: Per-tenant Slack configuration
An Enterprise Admin SHALL connect, configure, and disconnect a Slack workspace for their tenant: workspace name, default channel, per-trigger notification toggles, and digest channel/time. Credentials SHALL be stored encrypted at rest, never returned in plaintext by any API, and the integration SHALL be off until explicitly connected. A test-connection action SHALL verify the credentials.

#### Scenario: Workspace connected and tested
- **WHEN** an Enterprise Admin saves valid Slack credentials and runs Test connection
- **THEN** the config stores them encrypted, the status badge shows Connected, and a test message reaches the default channel

#### Scenario: Disconnect stops delivery
- **WHEN** the admin disconnects the workspace
- **THEN** no further Slack messages are sent for that tenant and in-app notifications continue unchanged

### Requirement: Notification triggers mirrored to Slack
When connected and the matching toggle is on, the system SHALL deliver to Slack the same events as in-app: new request → approvers, decision → requester, status change → requester. Slack delivery failures SHALL NOT block or delay in-app notifications.

#### Scenario: Approver notified in Slack
- **WHEN** a request is submitted and "notify approvers" is toggled on
- **THEN** each snapshotted approver receives a Slack message with the request summary

#### Scenario: Toggle off suppresses only Slack
- **WHEN** "notify requester on decision" is toggled off and an approver decides
- **THEN** no Slack message is sent but the in-app notification still fires

### Requirement: Interactive approval from Slack
Approval messages SHALL carry Approve and Reject buttons. The system SHALL verify the interaction's Slack signature, match the acting Slack user to a platform account by verified email, and authorize the action against that user's backend permissions. Unmatched or unauthorized users SHALL be refused with an explanatory reply. Reject SHALL still require a reason. Actions taken in Slack SHALL be identical in effect and audit to in-app actions.

#### Scenario: Approver approves from Slack
- **WHEN** a matched, authorized approver clicks Approve
- **THEN** the decision is recorded exactly as an in-app approval — snapshot checked, status advanced, audit written, requester notified

#### Scenario: Unmatched Slack user blocked
- **WHEN** a Slack user whose email matches no active platform account clicks a button
- **THEN** the action is refused and the user is told their Slack account isn't linked

#### Scenario: Reject requires a reason
- **WHEN** an approver clicks Reject in Slack
- **THEN** a reason is collected (modal) before the rejection is recorded

### Requirement: Daily digest and reminders
When enabled, the system SHALL post a daily absence digest to the configured channel at the configured time, and a daily pending-approval reminder to approvers with open items. Reminders SHALL never auto-decide a request.

#### Scenario: Digest posted on schedule
- **WHEN** the configured digest time arrives
- **THEN** the digest channel receives that day's absences (names, types, dates — no reasons)

#### Scenario: Pending reminder sent
- **WHEN** an approver has requests pending past the daily reminder time
- **THEN** they receive one Slack reminder listing their pending items, and no request state changes
