export const meta = {
  name: 'prd-compliance-audit',
  description: 'Audit the current smartEnterprise codebase against PRD.md, section by section, and adversarially verify each gap/claim before reporting.',
  whenToUse: 'Run at a phase boundary (e.g. before signing off Phase 1/2/3) to check implementation drift against PRD.md — not meant for routine per-PR review, use the tenant-rbac-guard agent or /code-review for that.',
  phases: [
    { title: 'Audit' },
    { title: 'Verify' },
  ],
}

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirement: { type: 'string', description: 'The specific PRD decision/requirement being checked, in one sentence' },
          status: { type: 'string', enum: ['implemented', 'partial', 'missing', 'not_yet_in_scope'] },
          evidence: { type: 'string', description: 'file:line or "not found" — must point at real code, not a guess' },
          notes: { type: 'string' },
        },
        required: ['requirement', 'status', 'evidence'],
      },
    },
  },
  required: ['topic', 'items'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    upheld: { type: 'boolean', description: 'true if the original status claim survives scrutiny of the actual code' },
    correctedStatus: { type: 'string', enum: ['implemented', 'partial', 'missing', 'not_yet_in_scope'] },
    reasoning: { type: 'string' },
  },
  required: ['upheld', 'correctedStatus', 'reasoning'],
}

const TOPICS = [
  {
    key: 'tenancy',
    title: 'Multi-tenancy & data isolation',
    prd: 'PRD.md §5 and §5.1',
    focus: 'row-level tenant_id isolation on every table/query, System Admin as the sole cross-tenant actor, Enterprise Registration → Accept/Reject → activation flow, the seeded default System Admin and its forced password change.',
  },
  {
    key: 'roles',
    title: 'Role model & RBAC',
    prd: 'PRD.md §4 (Personas, Role Model, Permission Matrix)',
    focus: 'users can hold multiple roles/departments, roles are permission bundles not titles, authority is contextual (PM/TL only over their own projects), the permission matrix in §4.4.',
  },
  {
    key: 'admin-console',
    title: 'Admin & configuration console pages',
    prd: 'PRD.md §5A and §5A.1, §5A.2',
    focus: 'User Master (both onboarding methods incl. expiring self-registration links), Departments/Roles/Projects/Leave Policy masters, Slack Configuration, Form Builder, delete-blocked-by-dependents rule, self-service + admin-initiated password reset.',
  },
  {
    key: 'form-engine',
    title: 'Form engine metadata & versioning',
    prd: 'PRD.md §6',
    focus: 'FormDefinition/FormSection/FormField metadata model, supported field types, client+server conditional visibility validation, immutable versioning with in-flight requests pinned to their version.',
  },
  {
    key: 'core-forms',
    title: 'The four core forms',
    prd: 'PRD.md §7 (Leave, WFH, Visitor, IT Change/Addition)',
    focus: 'each form\'s field list and validation exactly as specified, including conditional fields (HR-discussed dropdown only for >2 days, IT software/hardware branching, visitor check-in flow).',
  },
  {
    key: 'approval-workflow',
    title: 'Approval workflow engine',
    prd: 'PRD.md §8',
    focus: 'parallel approval (any rejection rejects), approver resolution from real users via filtered dropdowns and snapshotting onto the request, conditional approval stages, no-self-approval escalation matrix, auto-escalation when an approver is on leave or misses the window.',
  },
  {
    key: 'status-lifecycle',
    title: 'Status lifecycle',
    prd: 'PRD.md §9',
    focus: 'per-form state machines, role-gated transitions, notification-on-every-transition, withdraw/cancel locked after first approval action, auto-complete on end-date passing via scheduled job.',
  },
  {
    key: 'leave-balance',
    title: 'Leave balance & quota management',
    prd: 'PRD.md §10',
    focus: 'exactly-once atomic deduction on final approval with concurrency safety (never double-deducted or negative), restoration on cancel/withdraw of an approved request, LWP not deducting paid balance, pre-submit balance warnings.',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    prd: 'PRD.md §11',
    focus: 'in-app baseline + optional per-tenant Slack with interactive Approve/Reject buttons authorized against the matched platform user, all listed triggers, daily pending-approval reminders.',
  },
  {
    key: 'visibility',
    title: 'Request visibility & privacy',
    prd: 'PRD.md §11A',
    focus: 'employees see only their own requests, pending requests private to requester+assigned approvers, approved-absence surfacing tiered by role (Management=availability only, HR=full detail, PM/TL=own project members), the shared absence calendar with stacked/overlapping entries.',
  },
  {
    key: 'non-functional',
    title: 'Audit log & security NFRs',
    prd: 'PRD.md §13',
    focus: 'immutable AuditLog capturing before/after on create/edit/approve/reject/status-change, password hashing, RBAC checks on every API call, server-side re-validation of conditional logic.',
  },
]

const auditPrompt = (t) => `You are auditing the smartEnterprise codebase (repo root has PRD.md, apps/api, apps/web, packages/shared) for compliance with one PRD topic.

Topic: ${t.title}
Read ${t.prd} first for the exact requirements — do not rely on this summary alone: ${t.focus}

Then inspect the actual codebase (apps/api/src, apps/api/prisma/schema.prisma, apps/web/src, packages/shared/src) to determine, for each distinct requirement/decision in that PRD section, whether it is implemented, partially implemented, missing, or not yet in scope (e.g. a later-phase item per §15's roadmap — check which phase the codebase appears to be in before calling something "missing" if it's simply not due yet).

Break the topic into individual checkable requirements (don't lump everything into one item). For each, give the exact file:line evidence you found, or "not found" if you searched and it isn't there — never guess. Return via the required schema.`

const verifyPrompt = (t, item) => `Re-verify one audit claim about the smartEnterprise codebase. Be skeptical — the first pass may have misread the code or missed a file.

Topic: ${t.title}
Requirement: ${item.requirement}
Claimed status: ${item.status}
Claimed evidence: ${item.evidence}

Open the actual file(s) referenced (or search for them if "not found" was claimed) and confirm whether this status holds up. If the evidence doesn't actually support the claim, or you find contradicting code elsewhere, correct it. Return via the required schema.`

const results = await pipeline(
  TOPICS,
  (t) => agent(auditPrompt(t), { label: `audit:${t.key}`, phase: 'Audit', schema: AUDIT_SCHEMA }),
  (audit, t) => {
    if (!audit || !audit.items || audit.items.length === 0) {
      log(`${t.title}: no items returned`)
      return { topic: t.title, items: [] }
    }
    return parallel(audit.items.map((item) => () =>
      agent(verifyPrompt(t, item), { label: `verify:${t.key}`, phase: 'Verify', schema: VERDICT_SCHEMA })
        .then((v) => ({
          ...item,
          status: v && v.upheld === false ? v.correctedStatus : item.status,
          verifyNote: v ? v.reasoning : 'verification agent failed, original claim unverified',
        }))
    )).then((items) => ({ topic: t.title, items: items.filter(Boolean) }))
  }
)

const report = results.filter(Boolean)

for (const r of report) {
  const counts = r.items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})
  log(`${r.topic}: ${JSON.stringify(counts)}`)
}

const gaps = report.flatMap((r) =>
  r.items
    .filter((i) => i.status === 'missing' || i.status === 'partial')
    .map((i) => ({ topic: r.topic, ...i }))
)

return { report, gaps }
