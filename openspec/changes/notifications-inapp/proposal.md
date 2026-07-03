## Why

PRD §11 makes in-app notifications the baseline channel for every request event — approvers must learn about new requests and requesters about decisions without leaving the app. The approval and request changes that follow all assume a notification service exists to call; this change delivers it once.

## What Changes

- Add the **notification service**: a single writer that feature code calls at its trigger points — request submitted → approvers; approval/rejection → requester + remaining approvers; any status change → requester + relevant roles; escalation → escalation authority. Later changes (visitor check-in, IT fulfilment) register additional triggers against the same service.
- Add the **topbar bell dropdown**: unread badge count, latest notifications, mark-all-read, "view all" link.
- Add the **Notifications Center page**: All/Unread tabs, unread indicators, empty state.
- Add **real-time delivery**: Socket.IO push to the logged-in user with polling fallback (PRD §13: visible within 5s).
- Add the **daily pending-approval reminder job** (BullMQ): approvers with pending items get one in-app reminder per day; reminders never auto-decide (Slack delivery of the same reminder arrives with `slack-integration`).

## Capabilities

### New Capabilities
- `in-app-notifications`: the notification entity/service, bell dropdown, center page, real-time delivery, and daily reminders.

### Modified Capabilities
<!-- none -->

## Impact

- Depends on `org-masters` (users to notify). Trigger call-sites land inside `approval-workflow`, `leave-wfh-requests`, `visitor-management`, and `it-requests` as those changes are built — this change ships the service plus its UI.
- Uses the existing `Notification` entity from `setup-foundation`; adds Socket.IO to the API and web apps and a BullMQ worker for the daily reminder.
- Tenant-scoped and per-user: a notification is visible only to its recipient.
