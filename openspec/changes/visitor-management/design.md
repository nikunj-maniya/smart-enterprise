## Context

First Phase-2 change. The design's Employee · Visitor form and Reception · Front Desk screens are complete; PRD §7.3 and §9 govern behaviour. Rails come from `form-engine` (core renderer, status models), `approval-workflow` (Process Head stage), and `notifications-inapp`. Single timezone (Asia/Kolkata) keeps "today" unambiguous for the Front Desk.

## Goals / Non-Goals

**Goals:**
- A host can pre-register a visitor; a Process Head approves entry/gadgets.
- Front-desk staff can see today's visitors and run check-in/check-out.
- The host knows, without asking, when their guest arrives and leaves.

**Non-Goals:**
- Signature capture and object storage (Phase 4, D-27).
- A dedicated Reception role — front-desk is a permission on existing roles (PRD locked decision).
- Badge printing, watchlists, or recurring-visit automation.

## Decisions

- **Visitor is a core form, not bespoke screens** — rendered by the core renderer from metadata like Leave/WFH, so admins can relabel/reorder fields without redeploy. Alternative (hand-built page) rejected: it would fork the request pipeline for one form.
- **Single-approver stage via the standard engine** — the selected Process Head is a snapshotted `RequestApprover`; no special-case approval path. Multi-day visits still get one approval covering the declared range.
- **Promoted typed columns for check-in/out** — `check_in_at` / `check_out_at` live as real columns (per setup-foundation's hybrid payload strategy) because the Front Desk queries and sorts on them constantly.
- **"Today" filter is date-of-visit in tenant timezone** — expected list = approved visitors with visit date today; on-site = checked-in and not checked-out, regardless of planned out-time.
- **No-Show is manual, not automatic** — staff mark it; an automatic end-of-day sweep can come later. Keeps v1 free of a job whose rules (grace periods, multi-day visits) aren't settled.

## Risks / Trade-offs

- [Multi-day visits get one approval but arrive on several days] → the Front Desk shows the visitor on each declared day; check-in/out pairs are per-day timestamps on the same request in v1 — revisit if per-day logs are demanded.
- [Consent text changes over time] → store the consent flag with timestamp; versioned policy documents are out of scope for v1.
- [Manual No-Show discipline] → counts drift if staff forget; acceptable for v1, flagged for the Phase-4 polish pass.

## Open Questions

<!-- none — reception-role and signature questions are resolved by PRD locked decisions -->
