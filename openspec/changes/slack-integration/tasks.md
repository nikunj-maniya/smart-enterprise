## 1. Configuration

- [ ] 1.1 Encrypted `SlackConfig` storage + config APIs (save/connect/disconnect/test), no plaintext token ever returned, audit-logged _(Slice 1)_
- [ ] 1.2 Build the Slack Configuration page per the design (connection card + badge, workspace fields, toggles, conditional digest inputs, Test connection) _(Slice 1)_

## 2. Outbound Delivery

- [ ] 2.1 BullMQ Slack delivery worker with retries; failures never block in-app notifications _(Slice 2)_
- [ ] 2.2 Mirror triggers behind toggles: new request → approvers, decision/status change → requester _(Slice 2)_

## 3. Interactive Actions

- [ ] 3.1 Signed webhook endpoint: Slack signature + timestamp verification, then user matching by verified email _(Slice 3)_
- [ ] 3.2 Approve action: authorize against platform permissions, record via the standard approval service, update the Slack message _(Slice 3)_
- [ ] 3.3 Reject action with reason modal; unmatched/unauthorized users get an explanatory ephemeral reply _(Slice 3)_

## 4. Digest & Reminders

- [ ] 4.1 Daily absence digest job (configured channel/time, availability-level content only) _(Slice 4)_
- [ ] 4.2 Daily pending-approval reminder to approvers with open items; never auto-decides _(Slice 4)_

## 5. Verify

- [ ] 5.1 Connect → test message arrives; disconnect → Slack silent, in-app unaffected
- [ ] 5.2 Approve from Slack lands identically to in-app (snapshot, status, audit, requester notified)
- [ ] 5.3 Unmatched Slack user and bad-signature requests both refused
- [ ] 5.4 Reject from Slack requires a reason before recording
- [ ] 5.5 Digest and reminder fire at their configured times with correct, reason-free content
