## 1. Service & API

- [ ] 1.1 Typed event catalog + `notify()` writer persisting recipient-scoped `Notification` rows _(Slice 1)_
- [ ] 1.2 List / unread-count / mark-read / mark-all-read endpoints (recipient + tenant scoped, paginated) _(Slice 1)_

## 2. Bell Dropdown

- [ ] 2.1 Topbar bell with unread badge, recent list, mark-all-read, "view all" link — match the design exactly _(Slice 2)_

## 3. Notifications Center

- [ ] 3.1 Center page: All/Unread tabs with counts, unread dots, empty state — match the design _(Slice 3)_

## 4. Real-Time Delivery

- [ ] 4.1 Socket.IO server with JWT handshake; emit to `user:<id>` on notification create _(Slice 4)_
- [ ] 4.2 Web socket client joining the user room, updating badge/list live, 30s poll fallback _(Slice 4)_

## 5. Daily Reminder Job

- [ ] 5.1 BullMQ repeatable daily job: one summary reminder per approver with pending items _(Slice 5)_

## 6. Verify

- [ ] 6.1 A notification created for user A is invisible to user B and to other tenants
- [ ] 6.2 With the app open, a new notification updates the bell badge within 5 seconds
- [ ] 6.3 Mark-all-read empties the Unread tab and clears the badge
- [ ] 6.4 The daily job reminds only approvers who still have pending items
