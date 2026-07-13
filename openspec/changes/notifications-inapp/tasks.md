## 1. Service & API

- [x] 1.1 Typed event catalog + `notify()` writer persisting recipient-scoped `Notification` rows _(Slice 1)_ — pre-existed from `form-engine` (which needed the writer to fire its own request-event notifications): `notificationSchema` discriminated union (`enterprise_registered`/`request_approved`/`request_rejected`/`request_needs_approval`/`request_status_changed`/`approval_reminder`) in `packages/shared`, `notify()`/`notifyMany()` in `notifications.service.ts`.
- [x] 1.2 List / unread-count / mark-read / mark-all-read endpoints (recipient + tenant scoped, paginated) _(Slice 1)_ — mark-read/mark-all-read pre-existed; added pagination + a real `unreadCount` (previously the bell computed it client-side off a capped 20-row list, silently undercounting past 20 unread) to `GET /notifications?tab=all|unread&page&pageSize` via `notificationsQuerySchema`/`notificationsResponseSchema`.

## 2. Bell Dropdown

- [x] 2.1 Topbar bell with unread badge, recent list, mark-all-read, "view all" link — match the design exactly _(Slice 2)_ — badge/list/mark-all-read pre-existed in `Topbar.tsx`; added the "View all notifications" footer link to `/notifications` (prototype binds `goNotifications`/`viewAllLabel` with no literal default copy) and switched the badge to the server's `unreadCount`.

## 3. Notifications Center

- [x] 3.1 Center page: All/Unread tabs with counts, unread dots, empty state — match the design _(Slice 3)_ — new `pages/Notifications.tsx`: `PageHeader` (eyebrow "Notifications" + title "Notification Center") with a secondary "Mark all read" button, All/Unread pill tabs (count on Unread), list card with 38px icon tiles, and the design's empty state (`BellOff`, "You're all caught up" + tab-specific subtext). Reuses `notifStyle` (icon/title/link) extracted from `Topbar.tsx` into `lib/notificationDisplay.ts` so both surfaces render identically.

## 4. Real-Time Delivery

- [x] 4.1 Socket.IO server with JWT handshake; emit to `user:<id>` on notification create _(Slice 4)_ — `lib/socket.ts`: handshake validates the access token the same way `requireAuth` does (active user, non-suspended tenant) before joining `user:<id>`; `notify()`/`notifyMany()` now call `emitToUser()` right after each row insert (fire-and-forget, inside the caller's transaction — an accepted tradeoff over threading a post-commit callback through every call site, documented in `notifications.service.ts`).
- [x] 4.2 Web socket client joining the user room, updating badge/list live, 30s poll fallback _(Slice 4)_ — `lib/socket.ts` (web): lazy singleton connection authenticated with the stored access token, torn down on logout; `Topbar.tsx` and `Notifications.tsx` both subscribe to `notification:new` to bump the badge/prepend live, with the pre-existing 30s poll kept as fallback.

## 5. Daily Reminder Job

- [x] 5.1 BullMQ repeatable daily job: one summary reminder per approver with pending items _(Slice 5)_ — `jobs/approval-reminders.job.ts`: groups still-pending `RequestApprover` rows by approver (same staleness rule as `listApprovalQueue`'s pending tab), writes one `approval_reminder` notification per approver citing their pending count; repeatable at 09:00 Asia/Kolkata.

## 6. Verify

- [x] 6.1 A notification created for user A is invisible to user B and to other tenants — verified live: the System Admin's own notification list contained none of another tenant's `request_needs_approval`/`approval_reminder` rows.
- [x] 6.2 With the app open, a new notification updates the bell badge within 5 seconds — verified live with a real Socket.IO client: connected, then submitted a request naming the connected user as approver; `notification:new` arrived over the socket in well under a second (`SOCKET_CONNECTED` → `NOTIFICATION_RECEIVED` on the same test run).
- [x] 6.3 Mark-all-read empties the Unread tab and clears the badge — verified live: after `POST /notifications/read-all`, `GET /notifications?tab=unread` returned zero rows and `unreadCount: 0`.
- [x] 6.4 The daily job reminds only approvers who still have pending items — verified live: ran the job against a user with 2 pending approvals (got one `approval_reminder` citing `pendingCount: 2`) and a user with none (no reminder created, notification set unchanged); re-running is additive by design (design.md), not deduped.
