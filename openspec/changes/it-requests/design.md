## Context

Second Phase-2 change. The design's Employee · IT form (progressively disclosed after the access-type choice) and IT Admin · Fulfilment Queue screens are complete; PRD §7.4 and §9 govern behaviour. Runs on `form-engine`, `approval-workflow`, and `notifications-inapp`; catalog pages live in the Enterprise Admin console from `org-masters`.

## Goals / Non-Goals

**Goals:**
- An employee can request software access or hardware through one branched form.
- A Process Head approves; an IT Admin fulfils through a visible, assigned queue.
- Admins own the item catalogs without engineering involvement.

**Non-Goals:**
- Asset inventory/serial-number tracking — the queue tracks the request, not the asset.
- SLA timers or auto-assignment (impact stays an informational badge in v1).
- A `Closed` state distinct from `Fulfilled` in the UI (the model allows it; the design ends at Fulfilled).

## Decisions

- **One form, two branches — one FormDefinition** — the access-type field drives §6.4 visibility rules over branch sections rather than two separate forms. Keeps one request pipeline and one lifecycle; the server re-validates that only the active branch's fields arrive.
- **Item catalogs are master data, not form-field options** — pickers read `optionsSource: catalog`, so admin edits apply instantly without touching the form definition or its version. Alternative (options embedded in metadata) rejected: every catalog edit would force a form republish.
- **Archive, not delete, for referenced items** — mirrors §5A.1 referential-integrity rules; historical requests must keep rendering the items they named.
- **Fulfilment states via the standard status engine** — `In Progress`/`Fulfilled` are role-gated transitions owned by IT Admin, not a parallel mini-workflow; assignee is a promoted column for queue queries.
- **Assign-to-me is claim-based** — first admin to claim owns it; reassignment is just claiming again. No dispatcher/round-robin in v1.

## Risks / Trade-offs

- [Two catalog seeds drift from the PRD lists over time] → seeds are data, PRD is the source only at activation; tenants are expected to diverge — that is the feature.
- [Claim-based assignment can be raced by two admins] → the claim is a guarded single-row update; second claim fails gracefully and refreshes the card.
- [Impact is informational only] → Blocker requests get no special routing in v1; revisit if IT asks for prioritized tabs.

## Open Questions

<!-- none — approver choice (requester-selected Process Head) is a PRD locked decision -->
