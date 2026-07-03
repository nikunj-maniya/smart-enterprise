## ADDED Requirements

### Requirement: Notifications on request events
The system SHALL create a notification for each affected user at every request event: submission notifies the resolved approvers; an approval or rejection notifies the requester and the remaining approvers; every status change notifies the requester and the roles relevant to that state; an escalation notifies the escalation authority.

#### Scenario: Submission notifies approvers
- **WHEN** a request is submitted with three resolved approvers
- **THEN** each of the three receives a notification naming the requester and request type

#### Scenario: Decision notifies requester and remaining approvers
- **WHEN** one approver approves a pending request
- **THEN** the requester and each not-yet-decided approver receive a notification of the decision

### Requirement: Recipient-only visibility
A notification SHALL be visible only to its recipient, within their tenant; no API or UI SHALL expose another user's notifications.

#### Scenario: Other users cannot read a notification
- **WHEN** a user requests the notification list
- **THEN** only notifications addressed to that user, in that user's tenant, are returned

### Requirement: Bell dropdown with unread state
The topbar bell SHALL show the unread count, list recent notifications with unread indicators, support mark-all-read, and link to the Notifications Center, matching the design.

#### Scenario: Unread badge clears
- **WHEN** a user with unread notifications clicks mark-all-read
- **THEN** all their notifications become read and the badge disappears

### Requirement: Notifications Center page
The Notifications Center SHALL list the user's notifications with All and Unread tabs (with counts), per-item read state, and an empty state, matching the design.

#### Scenario: Unread tab filters
- **WHEN** the user opens the Unread tab
- **THEN** only unread notifications are listed and the tab shows their count

### Requirement: Real-time delivery
A newly created notification SHALL reach its logged-in recipient within 5 seconds via server push, with polling as fallback.

#### Scenario: Live badge update
- **WHEN** a notification is created for a user with the app open
- **THEN** their bell badge increments within 5 seconds without a page reload

### Requirement: Daily pending-approval reminder
A scheduled daily job SHALL send each approver with pending items one in-app reminder summarizing their pending count; reminders SHALL never act on the request.

#### Scenario: Approver with pending items reminded
- **WHEN** the daily job runs and an approver has two undecided requests
- **THEN** the approver receives one reminder notification citing two pending items

#### Scenario: Nothing pending, no reminder
- **WHEN** the daily job runs and an approver has no undecided requests
- **THEN** no reminder is created for them
