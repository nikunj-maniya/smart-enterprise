## ADDED Requirements

### Requirement: HR sign-off queue
An HR Head SHALL see a Sign-offs screen with Awaiting-HR and Decided tabs listing the Leave/WFH requests where they are the conditional (> 2 days) approver, each card showing requester, dates, reason, special-condition and over-balance flags, and the approval chain.

#### Scenario: HR reviews their queue
- **WHEN** an HR Head opens Sign-offs
- **THEN** requests awaiting their decision appear under Awaiting HR and their past decisions under Decided, with an all-signed-off empty state

### Requirement: Sign off or decline
The HR Head SHALL sign off or decline from the queue; declining requires a reason and, like any required-approver rejection, rejects the whole request.

#### Scenario: Decline requires a reason and rejects
- **WHEN** the HR Head declines a request and provides a reason
- **THEN** the request becomes Rejected, the reason is stored and shown to the requester, and the decision is audit-logged

#### Scenario: Sign-off counts toward final approval
- **WHEN** the HR Head signs off and every other required approver has approved
- **THEN** the request becomes Approved and balance deduction runs per the leave-balances rules
