## Context

Builds on `form-engine` (Leave/WFH are metadata-driven core forms with hand-built wizard renderers), `approval-workflow` (parallel engine + approver snapshot), and `org-masters` (projects, PM/Tech-Lead/HR-Head role data). PRD §7.1, §7.2, §10 govern behaviour; the design prototype's Employee Leave/WFH wizards, My Requests home, Leave Policy page, and HR Sign-offs screen are the visual contract. Single timezone (Asia/Kolkata).

## Goals / Non-Goals

**Goals:**
- An employee submits Leave/WFH end-to-end and tracks it from My Requests.
- Balances are provably correct: exactly-once deduction, restore on cancel, LWP exempt.
- The conditional > 2-days HR stage works on both forms, with the HR Sign-offs queue.

**Non-Goals:**
- Visitor/IT forms (Phase 2 changes), the generic no-code renderer (Phase 3).
- Half-day *specific-date* selection — v1 uses a count only (PRD; upgraded in `reporting-and-polish`).
- Accrual scheduling beyond annual allocation + carry-forward flag (per-tenant policy detail can grow later).

## Decisions

- **Deduction rides the approval engine's final-decision transaction** — the approval-workflow engine already serializes "last approver approves → status change"; balance deduction registers as a hook inside that same DB transaction rather than a separate listener, so status flip and deduction commit or roll back together.
- **Row-level serialization via `SELECT … FOR UPDATE` on `LeaveBalance`** — cheaper and simpler than serializable isolation for a single hot row; the balance is re-read and re-checked under the lock at decision time (PRD §10 "re-checks balance at that moment").
- **Half-days as a count, deducting 0.5 each** — matches the locked PRD decision; specific dates deferred.
- **My Requests is the employee's single home** — it lists all of the employee's requests (Leave/WFH now, Visitor/IT when those land) rather than per-form lists, matching the design's one table + detail drawer.
- **Special condition is data, not gate** — stored on the request, computed server-side against history, rendered as a badge for HR; no approval path branches on it.
- **HR Sign-offs is a filtered view of the same approval engine** — no separate HR decision model; the screen queries "requests where I am the HR-stage approver", and decline is a standard required-approver rejection with reason.

## Risks / Trade-offs

- [Hook coupling: balance logic inside the approval transaction slows the approval write] → the hook touches one row per leave type; acceptable, and correctness beats latency here.
- [Restore-on-cancel racing a concurrent status change] → cancel takes the same balance row lock and validates the request is still Approved before restoring.
- [Over-balance approved without conversion to LWP] → the flag stays visible on the approval card and audit log; HR conversion is a manual decision per PRD, not automated.

## Open Questions

<!-- none — conditional thresholds, LWP, and half-day handling are locked PRD decisions -->
