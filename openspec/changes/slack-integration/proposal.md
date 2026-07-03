## Why

Approvers live in Slack, not the app. PRD §11 makes Slack the optional per-tenant second channel — with interactive Approve/Reject buttons and daily reminders — so decisions happen where people already are, without weakening backend authorization.

## What Changes

- Add the **Slack Configuration page** to the Enterprise Admin console per the design: workspace connect/disconnect with status badge, workspace name + default channel, per-trigger toggles, daily digest configuration (channel/time), test connection. Credentials stored **encrypted at rest**; the whole integration is off by default.
- **Mirror in-app notification triggers to Slack** when enabled: notify approvers on new requests, requesters on decisions and status changes — each behind its toggle.
- Add **interactive Approve/Reject buttons** on approval messages: the acting Slack user is matched to a platform account by verified email and authorized against that user's backend permissions; unmatched users cannot act; Reject still requires a reason.
- Add the **daily absence digest** and the **daily pending-approval reminder** (Slack when enabled; reminders never auto-decide).

## Capabilities

### New Capabilities
- `slack-integration`: per-tenant Slack configuration, mirrored notification delivery, interactive approval actions, and scheduled digests/reminders.

### Modified Capabilities
<!-- none — notifications-inapp already defines the triggers; this adds a delivery channel -->

## Impact

- Depends on `notifications-inapp` (trigger points), `approval-workflow` (decision APIs the buttons call), and `org-masters` (admin console shell).
- Adds encrypted `SlackConfig` storage, a Slack delivery worker (BullMQ), a signed webhook endpoint for interactions, and the config screen.
- No change to in-app behaviour when Slack is disconnected — in-app remains the baseline channel.
