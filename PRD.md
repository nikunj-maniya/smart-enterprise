# Product Requirements Document — smartEnterprise Management

| | |
|---|---|
| **Product** | smartEnterprise Management Platform |
| **Author** | nikunj.maniya@smartsensesolutions.com |
| **Date** | 2026-06-29 |
| **Version** | 1.0 (Draft for review) |
| **Status** | Pending sign-off |

---

## 1. Executive Summary

smartEnterprise is a **multi-tenant, metadata-driven request & approval platform** that replaces the scattered Google Forms + Google Sheets workflow currently used to collect employee requests. It launches with four request types — **Leave**, **Work From Home (WFH)**, **Visitor Registration**, and **IT Change/Addition** — but is architected so that **new request forms can be added and existing forms modified with little or no engineering effort**.

Every request is routed to the correct people based on **role + department + project membership**, moves through a **defined status lifecycle**, and triggers **notifications** on creation and on every status change. The platform tracks **leave balances/quotas**, handles **conditional fields**, supports **parallel multi-approver sign-off**, and **escalates** requests made by approvers themselves to a higher authority.

### 1.1 Locked Decisions (from requirements discovery)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Tenancy | **Full multi-tenant from day one** — shared application, isolated tenant data, per-tenant forms/roles/branding |
| 2 | Form engine | **Hybrid** — 4 core forms have first-class coded renderers; a no-code builder handles future/custom forms. Core form *definitions* are still stored as metadata so they can be tuned without redeploys. |
| 3 | Approver identification | **Select real users** from a searchable directory (no free-text names) |
| 4 | Approval flow | **Parallel** — all assigned approvers must approve; any rejection rejects the request |
| 5 | Authentication | **Email/password only** (per-tenant user store) |
| 6 | Notifications | **In-app (primary)**; **Slack optional** per tenant |
| 7 | Visitor flow | **Employee pre-registers** visitor → **reception checks in** on arrival |
| 8 | IT fulfilment | **Process Head approves → IT Admin fulfils** (status: Requested → Approved → In Progress → Fulfilled) |
| 9 | Leave management | **Track balances & quotas** — accrual, deduction on approval, LWP support |
| 10 | Approver-as-requester | **Escalate to HR / higher role** — no self-approval ever |
| 11 | Platform | **Responsive web** (desktop + tablet for reception + mobile web) |
| 12 | Data migration | **Fresh start** — no import from Sheets |
| 13 | Audit & reporting | **Audit log in v1**; dashboards & export deferred to Phase 4 |
| 14 | Leave policy | **HR configures in-app** (leave types, quotas, accrual, reset) per tenant |
| 15 | Projects master | **Built in-app** — Admin/PM create projects & assign PM/TL/members; drives auto-routing |
| 16 | WFH "special condition" | **Soft flag for HR** (no hard gender/once-a-month block) |
| 17 | Half-days | **Count in v1**; specific-date selection in a later phase |
| 18 | Withdraw/cancel | Allowed **until first approval action**; locked after |
| 19 | Reception | **No separate role** — an existing role (Admin/HR) handles visitor check-in |
| 20 | Slack | **Approve/Reject from Slack** action buttons (when Slack enabled) |
| 21 | Branding/i18n | **Neither at v1** — single look, English; framework left ready |
| 22 | IT approver | **Requester selects** the Process Head (like the visitor form) |
| 23 | Request visibility | **Role-based** — see §11A |
| 24 | PM / Tech Lead fields | **Dropdowns** — PM list = **all PM/BA users company-wide**; Tech Lead = **project-specific** Tech Lead(s) |
| 25 | HR-discussed field | **Dropdown of HR Heads** (configurable); **mandatory for >2 days**; selected HR Head approves & is **notified directly** |
| 26 | Master-data deletes | Add/Edit always; **Delete only when no dependent records** (else explain & offer archive) — see §5A.1 |
| 27 | Absence calendar | **One shared calendar** that stacks **multiple people away the same day** (+N more, day detail, spans) — see §11A.3 |
| 28 | Admin hierarchy & onboarding | Two admin tiers: **System Admin** (whole platform) and **Enterprise Admin** (one enterprise). New enterprises self-register **with the Enterprise Admin's chosen username + password** → **System Admin Accepts/Rejects** → on Accept the account is **activated** (no invite email) — see §5.1 |
| 29 | Rejected applicants | **Deferred** — applicant-facing notification of a rejected registration is **not in this phase** (account simply stays inactive); revisit later |
| 30 | Password reset | **Self-service reset supported** for users who forget — via a secure standard flow (email reset link where email is enabled; admin-initiated reset as the no-email fallback) |
| 31 | Enterprise user onboarding | Two ways: **(a)** Enterprise Admin **creates** the user (username, password, name, role, department…); **(b)** Enterprise Admin shares a **self-registration link** so employees register themselves |
| 32 | Approver unavailable | **Auto-escalation** — if an assigned approver is on leave / doesn't act within the window, the approval auto-escalates to a configured backup/higher authority |
| 33 | Approval reminders | Approvers see **pending items on their dashboard** + a **daily Slack reminder** (in-app reminder when Slack is off) so nothing is forgotten; no auto-decision |

---

## 2. Problem Statement

The organization currently collects employee requests via Google Forms with responses landing in Google Sheets. This causes:

- **No routing or ownership** — the person who must approve isn't notified automatically; approvers are typed as free text.
- **No status visibility** — requesters and approvers cannot see where a request stands.
- **No access control** — anyone with a link can submit; there is no role-based gating of who can act on what.
- **No conditional logic enforcement** — conditional questions (e.g. ">2 days needs HR discussion") rely on the honor system.
- **No balance tracking** — leave availability is managed manually and error-prone.
- **No auditability** — changes and approvals aren't logged immutably.
- **No reusability** — every new form is a one-off; changes risk breaking downstream sheet formulas.

## 3. Goals & Non-Goals

### 3.1 Goals
1. Centralize all employee request forms into one role-aware platform.
2. Make forms **configurable** — add/modify forms and fields with minimal engineering.
3. Route every request to the correct approver(s) and **notify** them.
4. Give every request a **status lifecycle** visible to all stakeholders, with notifications on change.
5. Enforce **RBAC** — users see all forms but can only act on requests where their role assigns them authority.
6. Track **leave balances** accurately.
7. Be **multi-tenant** so other enterprises can be onboarded.

### 3.2 Non-Goals (v1)
- Payroll integration / salary computation.
- Migrating historical Google Sheets data (fresh start confirmed).
- Native iOS/Android apps (responsive web only).
- Google/SSO login (email/password only for v1).
- Full HRMS (attendance, performance reviews) — out of scope.
- Multi-timezone support — v1 operates entirely in **India (Asia/Kolkata)**; all dates/times, daily reminders, and the absence calendar use this single timezone.

---

## 4. Personas & Roles

### 4.1 Personas
- **Employee** — submits requests, tracks their own status.
- **Project Manager (PM)** — approves requests where the employee selects them. Appears in the PM dropdown on Leave/WFH forms.
- **BA (Business Analyst)** — treated alongside PM for approval selection; also appears in the PM dropdown on Leave/WFH forms.
- **Tech Lead (TL)** — **project-specific**; approves requests where they are the selected project's Tech Lead. Appears in the project-filtered Tech Lead dropdown.
- **HR Head** — approves leave/WFH > 2 days, handles escalations, manages leave quotas.
- **Process Head** — approves visitor gadget/entry and IT requests.
- **IT Admin** — fulfils approved IT requests, moves them through fulfilment statuses.
- **Receptionist / Security** — checks visitors in/out.
- **Enterprise Admin** — the top admin **within one enterprise (tenant)**. Manages that enterprise end-to-end: users, roles, departments, projects, leave policy, forms, Slack config and approval routing. Can log in and operate only **after the enterprise's registration is approved** by a System Admin.
- **System Admin (Platform Owner)** — runs the **entire platform across all enterprises**. Onboards enterprises by **reviewing and accepting/rejecting Enterprise Registration requests**, and owns platform-wide configuration. Not involved in any single enterprise's day-to-day requests.

### 4.2 Role Model
- A user belongs to **one or many departments**.
- A user holds **one or many roles**.
- Roles are **permission bundles**, not titles — a person can be both "Employee" and "Project Manager".
- **Authority to act on a request is contextual**: holding the "Project Manager" role only lets you approve requests for projects where *you* are assigned as PM — not all requests org-wide. (This directly implements the requirement: "I can see all forms but won't get a form request unless I have the role for it.")

### 4.3 Departments (Master — Enterprise Admin CRUD)
Seed values: **IOT, Developer, HR, Admin & Management, Sales & Marketing, Other**. Fully CRUD-able per tenant.

### 4.4 Permission Matrix (illustrative)

| Capability | Employee | PM | TL | HR Head | Process Head | IT Admin | Ent. Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| View all form types | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit a request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve where assigned | — | ✅ | ✅ | ✅ | ✅ | — | — |
| Approve leave/WFH > 2 days | — | — | — | ✅ | — | — | — |
| Approve visitor gadgets/entry | — | — | — | — | ✅ | — | — |
| Fulfil IT request | — | — | — | — | — | ✅ | — |
| Check visitor in/out *(existing role)* | — | — | — | ✅ | — | — | ✅ |
| Manage leave quotas | — | — | — | ✅ | — | — | ✅ |
| Configure forms / routing | — | — | — | — | — | — | ✅ |
| Manage users/roles/depts | — | — | — | — | — | — | ✅ |

---

## 5. Multi-Tenancy Architecture

- **Model:** Shared application + shared database with **row-level isolation** via mandatory `tenant_id` on every table, enforced at the data-access layer (and DB row-level security where supported). Schema-per-tenant can be adopted later for large tenants without API changes.
- **Per-tenant configuration:** departments, roles, users, form definitions, approval routing, leave policies, branding (logo/name), notification channels (Slack on/off).
- **Isolation guarantee:** no query may run without a tenant scope; cross-enterprise access is impossible for enterprise users. Only the **System Admin** operates across enterprises.

> **Terminology:** a *tenant* in the data model **is an enterprise**. The **System Admin** owns the platform (all enterprises); the **Enterprise Admin** owns a single enterprise.

---

## 5.1 Enterprise Registration & Onboarding Flow

A new enterprise self-registers; a System Admin gate-keeps access; an approved Enterprise Admin then runs their enterprise.

**Flow:**
1. **Register** — a prospective enterprise submits an **Enterprise Registration** request: company details **plus the intended Enterprise Admin's username (email) and a password they choose**. The enterprise and its Enterprise Admin account are created in status **Pending** — the password is stored **hashed** and the account stays **inactive** (cannot log in yet).
2. **Notify System Admin** — the registration lands in the System Admin's review queue and fires a notification.
3. **Accept / Reject** — the System Admin reviews and **Accepts** or **Rejects** the registration (rejection captures a reason).
   - On **Accept** → the enterprise becomes **Active** and the **pre-created Enterprise Admin account is activated**. No invite or credential email is needed — they log in with the **username & password they set during registration**.
   - On **Reject** → the registration is marked Rejected with the reason; the account is never activated, so no login is granted. The pending Enterprise Admin account / email reservation is **released on rejection**, so the same company/email may **submit a fresh registration** later. *(Notifying the rejected applicant is **out of scope for this phase** — revisit later; D-29.)*
4. **Enterprise Admin logs in** — once activated, the Enterprise Admin signs in with their self-chosen credentials and manages their enterprise: create departments, roles, users, projects, leave policy, forms and Slack config (per §5A).
5. (Optional later) **Suspend / Reactivate** — a System Admin can suspend an enterprise; suspended enterprises cannot log in.

**Enterprise lifecycle statuses:** `Pending → Active → (Suspended ⇄ Active)`; or `Pending → Rejected`.

**Default System Admin (platform bootstrap):** the platform ships with **one pre-seeded System Admin** account so the very first enterprise registrations can be reviewed:
- Email: `systemadmin@smartenterprise.com`
- Password: `Smart@123` — **default credential; must be force-changed on first login** and rotated before production.

This is the **only** account not created through an enterprise. The public **Enterprise Registration form** is open to anyone, but **only a System Admin can Accept/Reject** a submission.

**Who does what:**
| Step | Actor |
|---|---|
| Submit registration | Prospective enterprise (public registration page) |
| Review & Accept/Reject | **System Admin** |
| Manage the enterprise after approval | **Enterprise Admin** |

> Self-registration of an enterprise is distinct from a *user* signing up inside an already-approved enterprise (the user directory is still managed by the Enterprise Admin via the User Master).

---

## 5A. Admin & Configuration Console (Pages)

All configuration is done through dedicated in-app admin pages — **no seed data is hand-loaded by engineering**. Enterprise-level pages are owned by the **Enterprise Admin** (some shared with HR); platform-level functions (enterprise registration approval, cross-enterprise config) belong to the **System Admin**.

| Page | Who manages | Purpose |
|---|---|---|
| **Enterprise Registrations** *(platform)* | **System Admin** | Review the queue of incoming enterprise registrations; **Accept / Reject**, suspend/reactivate enterprises (see §5.1). |
| **User Master** | Enterprise Admin | **CRUD employees** via **two onboarding methods** (see §5A.2): (a) admin **creates** the user (username, password, name, role(s), department(s)…); (b) admin **shares a self-registration link** for employees to register themselves. Plus edit/deactivate, **reset passwords**, search/filter. The single source of truth for the user directory that powers approver pickers. |
| **Departments Master** | Enterprise Admin | CRUD departments (IOT, Developer, HR, Admin & Management, Sales & Marketing, Other, …). |
| **Roles & Permissions** | Enterprise Admin | Define roles as permission bundles; assign capabilities. |
| **Projects Master** | Enterprise Admin / PM | CRUD projects; assign **PM, Tech Lead, members** — drives Leave/WFH auto-routing. |
| **Leave Policy & Quotas** | **Enterprise Admin** (HR view per permission) | **CRUD leave types** and define **annual quotas, accrual cadence, carry-forward, reset date** per enterprise. Balances are derived from this config. |
| **Slack Configuration** | Enterprise Admin | **Each enterprise enters its own Slack credentials** (workspace/app token, target channels/DMs), toggles Slack on/off, and tests the connection. Stored encrypted, scoped to the enterprise. |
| **Form Builder / Form Config** | Enterprise Admin | Create/edit forms, fields, validation, conditional logic, approval routing & status models (see §6). |
| **Notification Settings** | Enterprise Admin | Enterprise-level channel toggles and per-user preferences. |

> Items 1, 2 and 4 of the earlier "seed data" list are therefore delivered as **first-class admin pages** (User Master, Slack Configuration, Leave Policy & Quotas) rather than one-time imports — so the enterprise self-manages them on an ongoing basis.

### 5A.2 Enterprise user onboarding (two methods)
1. **Admin-created** — the Enterprise Admin adds a user directly with username, password, name, role(s) and department(s). Useful for known joiners.
2. **Self-registration link** — the Enterprise Admin shares a registration link; employees **self-register** into that enterprise. New self-registrations land as **Employees** (role/department assignable by the admin; optional admin approval per policy). The link is **revocable** and **expires after a configurable window (default 30 minutes, set per enterprise)**; an expired or revoked link cannot be used to register.

**Password reset:** any user who forgets their password can reset it through a **secure self-service flow** (email reset link where email is enabled; **admin-initiated reset** as the no-email fallback). D-30.

### 5A.1 Master-data CRUD & referential integrity
All master data — **Leave Policy / leave types, Projects, Departments, Roles** (and item catalogs) — is fully **Add / Edit / Delete** by the authorized admin, with one safety rule:

- **Delete is allowed only when the record has no dependent references** (no "connection" / no existing records using it). Examples:
  - A **Department** can't be deleted while users are assigned to it.
  - A **Role** can't be deleted while it's assigned to any user or referenced by a workflow.
  - A **Project** can't be deleted while requests reference it or members/PM/TL are assigned.
  - A **Leave type** can't be deleted while balances or requests use it.
- When a delete is blocked, the UI **explains what's still using it** and offers the safe path (deactivate/archive, or reassign dependents first).
- **Edit** is always allowed; **deactivate/archive** is the recommended alternative to deletion for records with history.

---

## 6. Form Engine (Hybrid)

The form engine is the heart of the platform. **Every form — core or custom — is described by a metadata schema.** Core forms additionally get hand-built renderers for richness; custom forms use a generic renderer driven entirely by metadata.

### 6.1 Why hybrid
- The 4 known forms have nuanced UX (signature pad, searchable user pickers, conditional sections) — coded renderers give the best experience.
- Future/ad-hoc forms must be creatable by Enterprise Admins with **zero engineering**, via a no-code builder + generic renderer.
- Because *even core forms store their field list, validation, and routing as metadata*, an admin can re-label, reorder, mark optional/required, or change routing **without a deploy**. Structural changes that need new field *types* are the only thing requiring engineering.

### 6.2 Form metadata model (conceptual)

```
FormDefinition
  ├─ id, tenant_id, key (e.g. "leave"), title, description
  ├─ version (immutable versioning — submitted requests pin to the version they used)
  ├─ renderer: "core" | "generic"
  ├─ status: draft | published | archived
  ├─ sections[]
  │     └─ Field[]
  │           ├─ key, label, helpText, type, required
  │           ├─ options[] (for choice fields) | optionsSource (e.g. "users", "projects")
  │           ├─ validation (min/max, regex, dateRange, maxLength…)
  │           └─ visibility rules (conditional show/hide)
  ├─ approvalWorkflow (see §8)
  └─ statusModel (see §9)
```

### 6.3 Supported field types
`text`, `textarea`, `number`, `date`, `datetime`, `time`, `daterange`, `single-select`, `multi-select`, `radio`, `checkbox`, `checkbox-group`, `user-picker` (searchable, single/multi, filterable by role/department), `project-picker`, `signature`, `file-upload`, `consent-link` (link + checkbox), `section` / `group`.

### 6.4 Conditional logic
Each field/section can declare visibility rules referencing other fields, e.g.:
> Show section **"HR discussion"** when `away_duration == ">2 days"`.

Rules are evaluated client-side for UX **and** re-validated server-side on submit (never trust the client). Conditional **approval stages** (e.g. adding HR as a required approver when >2 days) are handled in the workflow layer (§8.3).

### 6.5 Versioning
Publishing a form creates a new immutable version. **In-flight requests stay pinned to the version they were created on**, so admin edits never corrupt or retro-change submitted requests. Reporting always knows which schema produced each record.

---

## 7. The Four Core Forms — Detailed Specs

> Legend: `*` = required. Conditional fields are noted with their trigger.

### 7.1 Leave Request Form

| Field | Type | Notes / Validation |
|---|---|---|
| Full Name* | auto (from profile) | Prefilled, read-only |
| Group / Department* | single-select | From user's departments |
| Project name* | project-picker (multi) | From projects the user is on |
| Project Manager* | **dropdown (single/multi-select)** | Options = users holding the **Project Manager** *or* **BA** role. Selectable by the employee. Each selected person becomes an approver. |
| Tech Lead* | **dropdown (single/multi-select)** | **Project-specific** — options are the Tech Lead(s) assigned to the selected project(s). Each selected person becomes an approver. |
| With whom did you discuss? | text | Optional context |
| Are you going to be away for long?* | radio | `≤2 days` / `>2 days` |
| HR discussed with | **dropdown** | Options = users holding the **HR Head** role (**configurable**, not hard-coded names). **Mandatory & shown only when `>2 days`.** The selected HR Head becomes a **required approver** and is **notified directly**. |
| Number of days* | number | > 0; cross-checked against date range |
| When will you go?* | radio | Today / Tomorrow / Later |
| Start date* | date | ≥ today (policy-configurable) |
| End date* | date | ≥ start date |
| Half-day count | number | Optional; ≤ total days |
| Type of leave* | single-select | `Leaves available`, `LWP`, `Becoming a father`, `Becoming a mother`, `Getting married` |
| Context* | textarea | — |

**Behaviour:** On approval, balance is deducted per leave type (unless LWP). For `>2 days`, the **HR Head the employee selected** in the "HR discussed with" dropdown is added to the parallel approver set and notified — the field is **mandatory** in that case. (See §10 for balance rules.)

### 7.2 Work From Home (WFH) Request Form

| Field | Type | Notes |
|---|---|---|
| Full Name* | auto | Read-only |
| Group / Department* | single-select | — |
| Project name* | project-picker (multi) | — |
| Project Manager* | **dropdown** | Options = users with the **Project Manager / BA** role; each selection becomes an approver |
| Tech Lead* | **dropdown** | **Project-specific** Tech Lead(s) of the selected project; each selection becomes an approver |
| With whom did you discuss? | text | Optional |
| Duration of days* | radio | `Up to 2 days` / `More than 2 days` |
| HR Head discussed with | **dropdown** | Options = **HR Head** users (configurable). **Mandatory & shown only when `More than 2 days`**; selected HR Head becomes a required approver and is notified directly |
| When?* | radio | Today / Tomorrow / Later |
| Can you not avoid this WFH?* | radio | Yes / No |
| Special condition? | radio (Yes/No) | **Soft flag for HR** — anyone may tick it; system surfaces a flag + monthly count to HR for review (no hard gender/once-a-month block in v1) |
| Detailed reason* | textarea | — |
| Start date* | date | — |
| End date* | date | ≥ start |
| Half-WFH count | number | Optional |

### 7.3 Visitor Registration Form

> Flow: **Host employee pre-registers** the visitor → Process Head approves gadgets/entry → **check-in/out on arrival handled by an existing role** (Admin/HR/front-desk) — no dedicated Reception role in v1.

| Field | Type | Notes |
|---|---|---|
| Mobile* | text | Phone validation |
| Visitor Name* | text | First + Last |
| Whom to meet* | user-picker | Searchable employee directory |
| Purpose* | textarea | — |
| Laptop details | textarea | Optional |
| Other device details | textarea | Optional |
| Process Head approval* | user-picker | Restricted to users with Process Head role |
| Will come for next days | checkbox | — |
| No. of days | number | **Disabled** unless checkbox ticked |
| Date & time of visit* | datetime | — |
| Out time* | time | — |
| Address | textarea | Optional |
| Passport number | text | Optional |
| Signature | signature | **Deferred — not in v1** (added in a later phase with object storage) |
| Privacy policy consent* | consent-link | Link + required checkbox |

**Statuses:** Pre-Registered → Approved (Process Head) → Checked-In (Reception) → Checked-Out / No-Show / Cancelled.

### 7.4 IT Change/Addition Request Form

**Step 1 — Access Type:** `Software` or `Hardware` (branches the form).

> **Approver:** the requester **selects the Process Head** from a dropdown of eligible users (same pattern as the visitor form). On approval the IT Admin fulfils.

**If Software:**
| Field | Type | Notes |
|---|---|---|
| Request type* | radio | Change of access / Removal of access / New access |
| Software items* | checkbox-group | Bitbucket, Gitlab, Github, Jira, Windows OS, DbForge, Adobe, GSuite, Drive Storage, Canva, Email group, Ubuntu OS, Skype |
| Impact* | radio | Blocker / Medium / Low |
| Job role* | textarea | 2 lines |
| Reason* | textarea | — |

**If Hardware:**
| Field | Type | Notes |
|---|---|---|
| Request type* | radio | Change of item / New item |
| Hardware items* | checkbox-group | Laptop, RAM, Testing phone, Mouse, Monitor, Keyboard, Water bottle, Fan, Pendrive, Hard disk, Software, Laptop charger, Tablet/iPad, Mobile data cable, Desk, Laptop connector, Monitor cord, HDMI/VGA cable, STPI Access card, ID card, GIFT Access card, Printer, Smartphone, Testing Laptop, Apple Wristwatch, Headphone, Laptop Battery |
| Impact* | radio | Blocker / Medium / Low |
| Job role* | textarea | — |
| Reason* | textarea | — |

> Item catalogs (software/hardware lists) are **master data**, editable by the Enterprise Admin without code changes.

**Statuses:** Requested → Approved (Process Head) → In Progress (IT Admin) → Fulfilled / Closed; or Rejected at any approval stage.

---

## 8. Approval Workflow Engine

### 8.1 Core model
Each form definition carries an **approval workflow** describing who must approve. v1 uses **parallel approval**: all assigned approvers must approve; **any single rejection moves the request to Rejected**. Approvers act independently and in any order.

### 8.2 Approver resolution
Approvers are **real users** the employee **selects from filtered dropdowns** at submission time:
- **Project Manager** dropdown → users holding the **PM or BA** role.
- **Tech Lead** dropdown → **project-specific** — the Tech Lead(s) assigned to the selected project.
- **HR Head** dropdown → users holding the **HR Head** role (only for `>2 days`; see §8.3).
- **Process Head** dropdown → users holding the **Process Head** role (Visitor / IT).

Every selected person becomes a required approver and is **notified directly**. The resolved approver set is **snapshotted onto the request** so later org changes don't alter an in-flight request's approvers.

### 8.3 Conditional approval stages
Rules can add/remove required approvers based on field values:
- Leave/WFH **> 2 days** → the **HR Head the employee selected** becomes a **mandatory** approver and is notified. (The "HR discussed with" dropdown is required in this case.)
- Visitor with gadgets → **Process Head** required.
- IT request → **Process Head** approval required before **IT Admin** fulfilment.

### 8.4 Escalation (approver-as-requester)
When the requester themselves holds an approver role for their own request, the system **never allows self-approval**. The request **escalates to a higher authority**:
- PM/TL/Manager requests → routed to **HR Head**.
- HR Head requests → routed to a **configured higher authority within the enterprise** (e.g. Enterprise Admin / CEO).

A configurable **escalation matrix** (role → approver-role) governs this per tenant.

### 8.4.1 Unavailable approver → auto-escalation
Because parallel approval needs **everyone** to approve, a single unavailable approver would otherwise stall a request. The system therefore **auto-escalates**:
- If an assigned approver is **on approved leave**, or **hasn't acted within the configured window**, their pending approval **auto-escalates** to a configured backup / higher authority (per the escalation matrix).
- The original approver and the requester are notified of the escalation; the escalated approver can then act in their place.

### 8.5 Approver actions
Approve, Reject (reason required), Request changes / Comment. All actions are logged (§13).

---

## 9. Status Lifecycle

Each form has a **configurable state machine**. Defaults:

| Form | States |
|---|---|
| **Leave / WFH** | Draft → Submitted → Pending Approval → **Approved** / **Rejected** → Cancelled / Withdrawn → Completed |
| **Visitor** | Pre-Registered → Pending Approval → Approved → Checked-In → Checked-Out / No-Show / Cancelled |
| **IT** | Requested → Pending Approval → Approved → In Progress → Fulfilled / Closed / Rejected |

Rules:
- Transitions are **role-gated** (only authorized roles can trigger a given transition).
- **Every transition fires notifications** to the requester and relevant stakeholders.
- Requesters can **Withdraw/Cancel** only **until the first approval action**; once any approver has approved/rejected, the request is locked from self-withdrawal.
- Post-approval **Cancel** is an **authorized-role action** (HR / Enterprise Admin), not self-withdrawal. Cancelling an already-approved Leave/WFH **restores** any deducted balance (§10).
- An **Approved** Leave/WFH automatically transitions to **Completed** once its **end date has passed** (via a scheduled daily job).
- The state machine is part of form metadata, so admins can extend states for new forms.

---

## 10. Leave Balance & Quota Management

- **Leave types** with annual **quota** and **accrual** rules, configured per tenant by HR/Admin (e.g. Casual 12/yr, Sick 6/yr, plus LWP, paternity, maternity, marriage).
- On **final approval**, the approved days are **deducted exactly once**, atomically, from the matching leave-type balance (half-days deduct 0.5). The deduction happens when the **last required approver** approves and re-checks balance at that moment — a 1-day leave deducts exactly 1 day, and concurrent/overlapping approvals are serialized so a balance can never be double-deducted or driven negative.
- On **Cancel/Withdraw of an already-approved request**, the previously deducted days are **restored** to the balance.
- **LWP** does not deduct from paid balances.
- **Pre-submit validation**: warn/flag when a request exceeds available balance; HR can still approve as LWP per policy.
- **Special-condition WFH** ("females only, once per month") validated against the user's history server-side.
- Balances are visible to the employee (e.g. "Casual 8/12 left") and to HR.
- **Phase note:** accrual scheduling (monthly/annual reset) is configurable; carry-forward rules are a tenant policy.

---

## 11. Notifications

- **Channels:** **In-app** (notification center, bell, unread counts) is the baseline. **Slack** is **optional** and enabled per tenant — Slack messages carry **interactive Approve / Reject buttons** so approvers can act without opening the app. The acting Slack user is matched to their platform account by **verified email** and the action is authorized against that user's permissions on the backend; an unmatched Slack user cannot act. No email in v1.
- **Triggers:**
  - New request submitted → notify all resolved approvers.
  - Approval/rejection by any approver → notify requester (+ remaining approvers).
  - Status change (any transition) → notify requester + relevant role(s).
  - Visitor checked in/out → notify host employee.
  - IT request moved to In Progress / Fulfilled → notify requester.
  - Escalation triggered → notify the escalation authority.
- **Pending-approval reminders:** approvers always see their **pending items on the dashboard**, and receive a **daily reminder** so nothing is forgotten — via **Slack when enabled**, otherwise in-app. Reminders never auto-decide a request.
- **Preferences:** users can tune which notifications they receive (within tenant policy).
- **Delivery:** in-app is real-time (websocket/poll); Slack via tenant-configured integration.

---

## 11A. Request Visibility & Privacy

Who can see which requests is **role-based** and depends on the request's **status**.

### 11A.1 Rules

| Viewer | Pending requests | Approved Leave/WFH (absences) |
|---|---|---|
| **Requester (any employee)** | Their **own** requests + live status only | Their own |
| **Assigned approver(s)** | Requests **routed to them** (full detail, to decide) | — |
| **Project Manager / Tech Lead** | Requests routed to them | **Their project members'** approved absences (who's away & when) |
| **Management Team** | — (not visible while pending) | **Availability view only** — who is away, dates, type (Leave/WFH/half-day). **Reason/context hidden.** |
| **HR Team** | — | **Full details**, including reason/context |
| **Enterprise Admin** | Config/oversight per policy | Per policy |

### 11A.2 Principles
- **Ordinary employees never see other employees' requests** — only their own and their own status.
- **Pending requests are private** to the requester and the assigned approver(s). Nothing about a request becomes broadly visible until it is **approved**.
- **On approval**, Leave/WFH requests surface as an **absence ("who's away") view** to Management, HR, and the employee's PM/TL — supporting planning and coverage.
- **Detail is gated by role:** Management sees **availability only** (a calendar of who's out); **HR sees the full request** including the personal reason/context. PM/TL see their own project members' absences.
- Reason/context fields are treated as **sensitive** and shown only to the approver chain + HR.

### 11A.3 Absence Calendar — concurrent absences
HR & Management share **one absence calendar**. It must correctly handle **multiple people away on the same day** (overlapping Leave, WFH, half-days, etc.):
- Each day cell shows a **stack of absence entries** — one chip per person, color-coded by type (Leave / WFH / half-day).
- When entries exceed what fits, the cell shows the first few plus a **"+N more"** affordance; clicking the day opens a **day detail** listing everyone away that day with their type and dates.
- Multi-day requests render as a **continuous span** across the dates they cover.
- Filters by **department, team/project, type, and person**; plus a **list/agenda view** alternative to the month grid for dense days.
- A day's **count badge** (e.g. "5 away") gives an at-a-glance coverage signal; reasons remain hidden in the Management view per §11A.1.

---

## 12. Data Model (Key Entities)

```
Tenant(id, name, branding, settings, status) -- status: Pending|Active|Suspended|Rejected; "tenant" = enterprise
EnterpriseRegistration(id, company_name, contact_name, contact_email, size,
                       status, reviewed_by, review_note, created_at) -- System Admin accepts/rejects
Department(id, tenant_id, name)               -- master, CRUD by Enterprise Admin
Role(id, tenant_id, key, name, permissions[]) -- permission bundles
User(id, tenant_id, name, email, password_hash, status)
UserRole(user_id, role_id)                     -- many-to-many
UserDepartment(user_id, department_id)         -- many-to-many
Project(id, tenant_id, name)
ProjectMember(project_id, user_id, role_in_project)  -- PM/TL/member mapping
LeaveType(id, tenant_id, name, quota, accrual_rule, is_paid)
LeaveBalance(id, user_id, leave_type_id, balance, period)

FormDefinition(id, tenant_id, key, title, version, renderer, status)
FormSection(id, form_definition_id, order, title, visibility_rule)
FormField(id, section_id, key, label, type, required, options, validation, visibility_rule)
ApprovalWorkflow(id, form_definition_id, mode=parallel, stage_rules)
StatusModel(id, form_definition_id, states, transitions)

Request(id, tenant_id, form_definition_id, form_version, requester_id, status, created_at)
RequestFieldValue(request_id, field_key, value)   -- or JSONB payload
RequestApprover(request_id, approver_id, role_context, decision, decided_at, comment)
RequestStatusHistory(request_id, from_state, to_state, actor_id, at, note)

Notification(id, tenant_id, user_id, type, payload, read, created_at)
AuditLog(id, tenant_id, actor_id, entity, entity_id, action, before, after, at)
Visitor(... extends Request: check_in_at, check_out_at, signature, consent)
```

> All tables carry `tenant_id`. Request payloads may use a hybrid of normalized `RequestFieldValue` rows + JSONB for flexible custom-form data.

---

## 13. Non-Functional Requirements

- **Security:** tenant data isolation enforced at data layer; passwords hashed (argon2/bcrypt); RBAC checks on every API call; server-side re-validation of all conditional logic and required fields; signed file/signature storage; rate limiting.
- **Audit trail:** immutable `AuditLog` capturing who did what, when, and before→after on every create/edit/approve/reject/status-change. *(Confirmed for v1 — delivered in Phase 1.)*
- **Performance:** form render < 1s; list/dashboard queries < 2s; notifications delivered < 5s.
- **Availability:** target 99.9%.
- **Scalability:** stateless app tier, horizontally scalable; multi-tenant aware caching.
- **Accessibility:** WCAG 2.1 AA for forms.
- **Compliance:** privacy-policy consent stored with visitor records; data retention policy per tenant.

---

## 14. Technology Stack *(confirmed)*

**Confirmed by stakeholder:** Node.js + TypeScript (backend), Vite + React + TypeScript + shadcn/ui (frontend), PostgreSQL (database), Docker (containerization). Supporting libraries chosen below.

| Layer | Choice | Rationale |
|---|---|---|
| **Backend runtime** | **Node.js + TypeScript** | Confirmed. Shares language/types with the frontend. |
| Backend framework | **NestJS** | Modular, dependency injection, first-class TypeScript, clean fit for RBAC/workflow modules. |
| **ORM** | **Prisma** (primary recommendation) | Type-safe, excellent migrations & DX; tenant scoping enforced in the data-access layer. *(Drizzle is a lighter alternative if you prefer SQL-first.)* |
| Validation | **Zod** (shared FE/BE schemas) + class-validator | One schema definition reused by API and the dynamic form renderer. |
| Auth | JWT (access + refresh tokens), **argon2** password hashing | Matches email/password decision; SSO addable later. |
| **Frontend** | **Vite + React + TypeScript** | Confirmed. Fast dev/build. |
| UI components | **shadcn/ui** (Radix UI + Tailwind CSS) | Confirmed. Accessible, composable primitives. |
| Form rendering | **react-hook-form + Zod resolver** | Powers both the coded core forms and the JSON-schema-driven generic renderer. |
| Data fetching | **TanStack Query** | Caching, optimistic updates for approvals. |
| Routing | **React Router** | SPA routing (Vite, not Next.js). |
| **Database** | **PostgreSQL** | Confirmed. Relational integrity + JSONB form payloads + row-level isolation. |
| Cache / queue store | **Redis** | Backs background jobs & caching (see below). |
| Background jobs | **BullMQ** (on Redis) | Notification fan-out, leave accrual scheduling, monthly resets. |
| Real-time | **WebSocket (Socket.IO)** | Live in-app notifications. |
| Object storage | **Deferred** | Visitor signatures & file uploads are **not in v1**. When introduced, add S3-compatible storage (**MinIO**, bundled as a container). |
| API style | **REST**, documented with **OpenAPI** | Broad client compatibility; typed via shared Zod schemas. |
| **Containerization** | **Docker + docker-compose** | Confirmed. **Self-contained, deploy-anywhere** bundle: app + **PostgreSQL + Redis** all run as containers, no managed-cloud dependency. Kubernetes-orchestratable later. |
| Deployment model | **Docker-deployable anywhere** | No cloud lock-in; the whole stack ships as containers so any enterprise can run it on their own infrastructure. |
| Repo layout | **Monorepo** (frontend + backend + shared types) | Single source of truth for shared Zod types. |

---

## 15. Phased Roadmap

**Phase 1 — Foundation & Leave/WFH (MVP)**
- Multi-tenant scaffolding, auth, RBAC, departments/roles/users/projects masters.
- **Enterprise registration + System Admin accept/reject onboarding** (§5.1); Enterprise Admin console.
- Form metadata engine + core renderer.
- Leave & WFH forms with conditional logic, parallel approval, escalation.
- Leave balance tracking. In-app notifications. Status lifecycle + audit log.

**Phase 2 — Visitor & IT**
- Visitor pre-registration + reception check-in/out + Process Head approval.
- IT Software/Hardware forms + Process Head → IT Admin fulfilment.
- Master data for item catalogs.

**Phase 3 — No-code builder & extensibility**
- Drag-and-drop form builder + generic renderer for custom forms.
- Configurable workflows/statuses via UI.
- Slack integration.

**Phase 4 — Reporting & polish**
- Dashboards, CSV/Excel export, advanced analytics, notification preferences, PWA.
- **Visitor signatures + object storage (MinIO)** and half-day specific-date selection (both deferred from v1).

---

## 16. Success Metrics
- 100% of in-scope requests submitted through the platform (Google Forms retired).
- Median approval turnaround time trending down month-over-month. *(No pre-launch baseline exists — fresh start, no migration; the first 30 days post-launch serve as the internal baseline.)*
- 0 mis-routed requests; every request reaches the correct approver automatically.
- Leave-balance disputes reduced to near zero.
- New form created by an admin **without engineering** (Phase 3 acceptance test).

---

## 17. Resolved Decisions & Remaining Inputs

### 17.1 Resolved in discovery (now reflected throughout this PRD)
- Audit log in v1; dashboards/export in Phase 4.
- Leave policy configured in-app by HR per tenant.
- Projects master built in-app; drives PM/TL auto-routing.
- WFH "special condition" = soft flag for HR (no hard block).
- Half-days captured as a count in v1 (specific dates later).
- Withdraw/cancel allowed only until the first approval action.
- No separate Reception role — an existing role handles check-in.
- Slack notifications include interactive Approve/Reject buttons (when enabled).
- No branding/i18n at v1 (framework left ready).
- IT request Process Head is selected by the requester.
- Request visibility is role-based per §11A (employees see only their own; approved absences surface to Management = availability only, HR = full, PM/TL = their project members').

### 17.2 Now delivered as admin pages (see §5A) — no manual seeding
1. **Users** → managed via the **User Master** page (CRUD users, roles, departments).
2. **Slack credentials** → entered by each enterprise on the **Slack Configuration** page.
3. **Leave quotas** → managed by the Enterprise Admin on the **Leave Policy & Quotas** page.

### 17.3 Tech stack — confirmed
- Backend **Node.js + TypeScript** (NestJS + Prisma), Frontend **Vite + React + TypeScript + shadcn/ui**, **PostgreSQL**, **Docker**. Supporting libraries chosen in §14.

### 17.4 Infra — confirmed
- **Deployment:** Docker-deployable anywhere (self-contained app + PostgreSQL + Redis containers; no cloud lock-in).
- **Redis:** confirmed (background jobs, caching).
- **Object storage / visitor signatures:** **deferred to a later phase** — not in v1.

> All architectural, product, and stack decisions are now resolved. No open inputs remain for design or build planning.

---

*End of PRD v1.0 — all architectural decisions captured. Remaining items in §17.2 are seed data / operational inputs that don't block design or build planning.*
