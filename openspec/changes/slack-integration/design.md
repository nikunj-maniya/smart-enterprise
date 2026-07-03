## Context

Phase 3. In-app notifications (the §11 baseline) already exist; this adds Slack as the optional per-tenant channel with interactive actions. The design's Admin · Slack screen (connection card, workspace config, toggles, digest settings) is complete. PRD §5A item 7 and §11 govern behaviour; PRD locked decisions require Slack buttons to be permission-checked against the platform account.

## Goals / Non-Goals

**Goals:**
- A tenant admin can connect Slack, choose what gets mirrored, and trust that buttons are as safe as the app.
- Approvers can decide from Slack with full audit parity.
- Daily digest + pending reminders reach the configured channel on time.

**Non-Goals:**
- Email or any third channel (not in v1 scope).
- Per-user Slack DM preference granularity beyond tenant toggles (Phase 4 preferences).
- Slack slash-commands or a bot conversation UI.

## Decisions

- **Credentials encrypted at rest, decrypt-on-use only** — AES-256-GCM with a key from environment config; APIs return connection status, never token material. Alternative (plaintext column, "internal DB") rejected outright: §13 security posture and multi-tenant blast radius.
- **Signed-webhook verification before anything else** — every interaction endpoint verifies Slack's request signature (signing secret, timestamp window) before parsing; unsigned or stale requests are dropped.
- **Authorization is the platform's, not Slack's** — button clicks resolve Slack user → verified platform email → active user, then call the same approval service as the UI with that user's permissions. Slack is a transport; the decision path, snapshot checks, reason-required rule, and audit entries are byte-identical to in-app.
- **Delivery via a BullMQ worker** — Slack sends are queued with retries; in-app notification writes never wait on Slack. A dead Slack config degrades to in-app silently plus a connection-status warning on the config page.
- **Digest/reminder as scheduled jobs per tenant** — configured time evaluated in Asia/Kolkata; digest content reuses the absence-visibility rules (availability only, no reasons in channel posts).

## Risks / Trade-offs

- [Slack token revoked out-of-band] → delivery failures flip the connection badge to Disconnected-with-error and notify the admin in-app; no message loss for in-app.
- [Email mismatch between Slack and platform] → unmatched users get an explanatory ephemeral reply; linking flow beyond verified-email matching is out of scope (PRD locked decision).
- [Channel posts leak absence details] → digest/channel content carries availability-level data only; full detail stays in DMs to the authorized approver.

## Open Questions

<!-- none — button authorization and reminder cadence are PRD locked decisions -->
