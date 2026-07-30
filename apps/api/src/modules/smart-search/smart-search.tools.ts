import { z } from 'zod';
import {
  SystemRoleKey,
  absenceTypeSchema,
  approvalQueueQuerySchema,
  approvalQueueTabSchema,
  myRequestsQuerySchema,
  orgUsersQuerySchema,
  projectStatus,
  projectsQuerySchema,
  rolesQuerySchema,
  userStatus,
  type AbsenceEntryDto,
  type ApprovalQueueItemDto,
  type DepartmentDto,
  type DepartmentsQuery,
  type FrontDeskVisitorDto,
  type HolidayDto,
  type LeaveBalanceDto,
  type OrgUserDto,
  type ProjectDto,
  type RequestListItemDto,
  type SmartSearchToolName,
} from '@se/shared';
import { HttpError } from '../../lib/http-error.js';
import { listAbsences } from '../absences/absences.service.js';
import type { Viewer } from '../requests/visibility-policy.js';
import { listDepartments } from '../departments/departments.service.js';
import { getTodayView } from '../front-desk/front-desk.service.js';
import { listHolidays } from '../holidays/holidays.service.js';
import { getMyLeaveBalances } from '../leave-balances/leave-balances.service.js';
import { listOrgUsers } from '../org-users/org-users.service.js';
import { listProjects } from '../projects/projects.service.js';
import { listRoles } from '../roles/roles.service.js';
import { listApprovalQueue, listMyRequests } from '../requests/requests.service.js';
import { searchDirectoryUsers } from '../directory/directory.service.js';

// Mirrors `ABSENCE_VIEWER_ROLES` in departments.routes.ts/projects.routes.ts verbatim — not
// imported from there since neither file exports it, and both master lists share the same
// read-access rule (open to whoever `resolveAbsenceScope` already grants absence visibility to).
const DEPARTMENT_PROJECT_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

// Mirrors `requireFrontDeskAccess` in front-desk.routes.ts verbatim — not imported since it's a
// local middleware closure, not exported. Front-desk access is a permission on these two existing
// roles, not a dedicated role (design.md, a PRD-locked decision), same two roles the Visitor
// status model already gates check-in/out to.
const FRONT_DESK_VIEWER_ROLES = [SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead];

const rangeEnum = z.enum(['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'custom']);

/** Server-clock day, formatted as the plain `YYYY-MM-DD` the rest of the codebase uses. Formats
 *  from local Y/M/D components (not `toISOString`, which converts through UTC and would shift the
 *  calendar day by one in any timezone ahead of UTC). */
export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Resolves the tool's relative `range` enum to concrete [from, to] ISO dates using the server's
 * clock — the model is never asked to compute or state a date itself. Weeks run Monday–Sunday.
 */
export function resolveDateRange(
  range: z.infer<typeof rangeEnum>,
  rangeStart: string | undefined,
  rangeEnd: string | undefined,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = addDays(today, mondayOffset);

  switch (range) {
    case 'today':
      return { from: toIsoDate(today), to: toIsoDate(today) };
    case 'tomorrow': {
      const tomorrow = addDays(today, 1);
      return { from: toIsoDate(tomorrow), to: toIsoDate(tomorrow) };
    }
    case 'this_week':
      return { from: toIsoDate(thisMonday), to: toIsoDate(addDays(thisMonday, 6)) };
    case 'next_week': {
      const nextMonday = addDays(thisMonday, 7);
      return { from: toIsoDate(nextMonday), to: toIsoDate(addDays(nextMonday, 6)) };
    }
    case 'this_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
    case 'custom':
      // The schema's `.refine` below guarantees both are present whenever range is "custom".
      return { from: rangeStart!, to: rangeEnd! };
  }
}

/** Fallback window when a question names a specific person but gives no date ("is X's leave
 *  approved?") — wide enough to catch a recent or upcoming request without being unbounded. */
export function defaultWideWindow(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: toIsoDate(addDays(today, -90)), to: toIsoDate(addDays(today, 90)) };
}

// `.nullish()` + normalize, not `.optional()`: verified live that this model (via Ollama's
// OpenAI-compat tool-calling) fills unset optional parameters with explicit JSON `null` rather
// than omitting the key — `.optional()` alone rejects that shape outright, so every call with any
// unset optional argument was silently falling into the "invalid args" decline path.
const nullishString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

export const queryAbsencesArgsSchema = z
  .object({
    // Optional, not required: a question naming a specific person ("is X's leave approved?") has
    // no natural date to give — forcing the model to guess one produced wrong answers in practice.
    // Omitted range falls back to `defaultWideWindow` in the executor instead.
    range: rangeEnum.nullish().transform((v) => v ?? undefined),
    rangeStart: nullishString,
    rangeEnd: nullishString,
    type: absenceTypeSchema.nullish().transform((v) => v ?? undefined),
    // Resolved to a tenant-scoped user id in the executor via the same directory search the
    // user-picker fields use — never trusted as an id directly, and never a cross-tenant lookup.
    personName: nullishString,
  })
  .refine((v) => v.range !== 'custom' || (!!v.rangeStart && !!v.rangeEnd), {
    message: 'rangeStart and rangeEnd are required when range is "custom"',
  });
export type QueryAbsencesArgs = z.infer<typeof queryAbsencesArgsSchema>;

export const queryUsersArgsSchema = z.object({
  search: nullishString,
  status: userStatus.nullish().transform((v) => v ?? undefined),
  departmentId: nullishString,
  // Free-text role name (e.g. "Project Manager", "HR Head", or a tenant's own custom role) —
  // resolved to a tenant-scoped role id in the executor via a name search, same reasoning as
  // queryAbsences' personName: never trusted as an id directly.
  role: nullishString,
});
export type QueryUsersArgs = z.infer<typeof queryUsersArgsSchema>;

// `range` is optional here (unlike queryAbsences, where a time window is always implied): a
// question like "what are all my requests" has no date to scope by, so omitting `range` returns
// the viewer's recent history unfiltered. When one IS given ("my leave request for tomorrow"),
// the executor filters to it server-side — this is what actually fixes returning the viewer's
// entire history as `rows` for a question about one specific day (verified live: the narrated
// `reply` was already correct, but `rows` — what the UI renders as a table — still echoed back
// every unrelated past request alongside it).
export const queryMyRequestsArgsSchema = z
  .object({
    range: rangeEnum.nullish().transform((v) => v ?? undefined),
    rangeStart: nullishString,
    rangeEnd: nullishString,
    // Free-form, not a fixed enum like queryAbsences' leave/wfh: form keys are open-ended per
    // tenant (leave, wfh, visitor, it, ...), not a closed set this tool can enumerate up front.
    formKey: nullishString,
  })
  .refine((v) => v.range !== 'custom' || (!!v.rangeStart && !!v.rangeEnd), {
    message: 'rangeStart and rangeEnd are required when range is "custom"',
  });
export type QueryMyRequestsArgs = z.infer<typeof queryMyRequestsArgsSchema>;

/** True if a request's [startDate, endDate] span overlaps [from, to] — requests with no date
 *  (non-date form types) never match a date-scoped question. */
function overlapsRange(row: RequestListItemDto, from: string, to: string): boolean {
  if (!row.startDate || !row.endDate) return false;
  return row.startDate.slice(0, 10) <= to && row.endDate.slice(0, 10) >= from;
}

export const queryDepartmentsArgsSchema = z.object({
  search: nullishString,
  archived: z.boolean().nullish().transform((v) => v ?? undefined),
});
export type QueryDepartmentsArgs = z.infer<typeof queryDepartmentsArgsSchema>;

export const queryProjectsArgsSchema = z.object({
  search: nullishString,
  status: projectStatus.nullish().transform((v) => v ?? undefined),
});
export type QueryProjectsArgs = z.infer<typeof queryProjectsArgsSchema>;

export const queryHolidaysArgsSchema = z.object({
  // Nullish, not optional, same reasoning as every other tool's optional field in this file — the
  // model fills an unset arg with explicit `null`, not by omitting the key.
  year: z.number().int().nullish().transform((v) => v ?? undefined),
});
export type QueryHolidaysArgs = z.infer<typeof queryHolidaysArgsSchema>;

// No args at all: this tool is always scoped to the viewer's own balances, so there's nothing for
// the model to supply.
export const queryMyLeaveBalancesArgsSchema = z.object({});
export type QueryMyLeaveBalancesArgs = z.infer<typeof queryMyLeaveBalancesArgsSchema>;

// No args: `getTodayView` always covers the tenant's current calendar day (IST) — there's nothing
// for the model to supply.
export const queryFrontDeskVisitorsArgsSchema = z.object({});
export type QueryFrontDeskVisitorsArgs = z.infer<typeof queryFrontDeskVisitorsArgsSchema>;

export const queryMyApprovalsArgsSchema = z.object({
  // Defaults to "pending" (not left unset) since "what's pending my approval" is by far the more
  // common phrasing — "what have I already approved/rejected" is the one case the model needs to
  // actively supply "decided" for.
  tab: approvalQueueTabSchema.nullish().transform((v) => v ?? 'pending'),
});
export type QueryMyApprovalsArgs = z.infer<typeof queryMyApprovalsArgsSchema>;

/**
 * The registry entry shape all tools are stored as once erased to a common type — `defineTool`
 * below is the single, documented cast point that lets a heterogeneous array of differently-typed
 * tools exist without any `any` escaping into the rest of the module.
 */
interface SmartSearchToolEntry {
  name: SmartSearchToolName;
  description: string;
  parameters: Record<string, unknown>;
  argsSchema: z.ZodTypeAny;
  execute: (tenantId: string, viewer: Viewer, args: unknown) => Promise<unknown[]>;
}

function defineTool<TArgs>(entry: {
  name: SmartSearchToolName;
  description: string;
  parameters: Record<string, unknown>;
  // Input left as `unknown` rather than tied to `TArgs`: the schemas below transform their raw
  // (pre-parse) shape — which tolerates the model's literal `null`s — into `TArgs`, so the parsed
  // *input* legitimately differs from the *output* type this tool's `execute` receives.
  argsSchema: z.ZodType<TArgs, z.ZodTypeDef, unknown>;
  execute: (tenantId: string, viewer: Viewer, args: TArgs) => Promise<unknown[]>;
}): SmartSearchToolEntry {
  return entry as SmartSearchToolEntry;
}

/**
 * The full static tool registry. Adding a new domain later is one more `defineTool(...)` entry in
 * this array — nothing else in the pipeline needs to change.
 */
export const SMART_SEARCH_TOOLS: SmartSearchToolEntry[] = [
  defineTool<QueryAbsencesArgs>({
    name: 'queryAbsences',
    description:
      'Answers questions about staff leave/WFH availability — who is on leave or WFH, over what date range, and for how many days, INCLUDING a specific named colleague\'s leave/WFH status ("is Jane\'s leave approved?", "when is Bob on WFH?"). Scoped to whatever the asking viewer is allowed to see. For the VIEWER\'S OWN requests, use queryMyRequests instead, not this tool.',
    parameters: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'custom'],
          description: 'Relative time window for the query. Omit if the question names a person but gives no date.',
        },
        rangeStart: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) start of the range. Only used when range is "custom".',
        },
        rangeEnd: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) end of the range. Only used when range is "custom".',
        },
        type: {
          type: 'string',
          enum: ['leave', 'wfh'],
          description: 'Optional filter: only leave, only wfh. Omit for both.',
        },
        personName: {
          type: 'string',
          description: 'Optional: the specific colleague\'s name the question is about. Omit for "who\'s on leave" style questions covering everyone.',
        },
      },
      required: [],
    },
    argsSchema: queryAbsencesArgsSchema,
    execute: async (tenantId, viewer, args): Promise<AbsenceEntryDto[]> => {
      const { from, to } = args.range
        ? resolveDateRange(args.range, args.rangeStart, args.rangeEnd)
        : defaultWideWindow();
      let personId: string | undefined;
      if (args.personName) {
        // Same tenant-scoped, no-extra-permission-needed lookup the user-picker fields already
        // use — resolves a name to an id server-side; the model only ever supplies free text.
        const matches = await searchDirectoryUsers(tenantId, { search: args.personName, limit: 5 });
        if (matches.length === 0) return []; // no matching person — narration reports no data found
        personId = matches[0].id;
      }
      // Permission-scoping (HR/Enterprise Admin/PM-TL/deny) lives entirely inside `listAbsences`
      // via `resolveAbsenceScope` — reused verbatim, not reimplemented here.
      const result = await listAbsences(tenantId, viewer, { from, to, type: args.type, personId });
      return result.rows;
    },
  }),
  defineTool<QueryUsersArgs>({
    name: 'queryUsers',
    description:
      'Answers questions about the tenant user directory — list, search, or filter employees by name/email, status, department, or role (e.g. "list all Project Managers", "who are the HR Heads", or any of the tenant\'s own custom roles). "Project Manager" here is a ROLE held by a person, not the queryProjects tool\'s PROJECT records — use this tool, not queryProjects, whenever the question is asking for people (a list of employees/managers), not named projects. Enterprise Admin only.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text match against name or email.' },
        status: {
          type: 'string',
          enum: ['Pending', 'Active', 'Inactive', 'Suspended'],
          description: 'Optional filter by account status.',
        },
        departmentId: { type: 'string', description: 'Optional filter by department id.' },
        role: {
          type: 'string',
          description:
            'Optional filter by role name, e.g. "Project Manager", "Tech Lead", "HR Head", "Enterprise Admin", or a tenant\'s own custom role name.',
        },
      },
      required: [],
    },
    argsSchema: queryUsersArgsSchema,
    execute: async (tenantId, viewer, args): Promise<OrgUserDto[]> => {
      // `listOrgUsers` itself enforces no permission check (today it's gated only by the
      // `requireEnterpriseAdmin` Express middleware on the REST route) — so the tool executor adds
      // the same check explicitly before touching any data.
      if (!viewer.roles.includes(SystemRoleKey.EnterpriseAdmin)) {
        throw new HttpError(403, 'Enterprise Admin access required');
      }
      let roleId: string | undefined;
      if (args.role) {
        // Same tenant-scoped, name-based resolution pattern as queryAbsences' personName — the
        // model only ever supplies free text, never an id.
        const roleMatches = await listRoles(tenantId, rolesQuerySchema.parse({ search: args.role, archived: false }));
        if (roleMatches.rows.length === 0) return []; // no matching role — narration reports no data found
        roleId = roleMatches.rows[0].id;
      }
      const query = orgUsersQuerySchema.parse({
        page: 1,
        pageSize: 25, // capped so the narration prompt and any rendered table stay small
        search: args.search,
        status: args.status,
        departmentId: args.departmentId,
        roleId,
      });
      const result = await listOrgUsers(tenantId, query);
      return result.rows;
    },
  }),
  defineTool<QueryMyRequestsArgs>({
    name: 'queryMyRequests',
    description:
      "Answers questions about the VIEWER'S OWN submitted requests — leave, WFH, or any other form — and their current approval status (e.g. \"what's the status of MY leave request\"). ONLY for the viewer's own submissions — if the question names or refers to a different person (e.g. \"is Jane's leave approved?\"), use queryAbsences instead, never this tool. Available to any authenticated user, no role restriction, since a person's own requests are never a permission concern. Supply `range` when the question references a specific day/period (e.g. \"tomorrow\"); omit it for a general \"what are my requests\" question.",
    parameters: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'custom'],
          description: 'Only include requests overlapping this period. Omit for no date filter.',
        },
        rangeStart: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) start of the range. Only used when range is "custom".',
        },
        rangeEnd: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) end of the range. Only used when range is "custom".',
        },
        formKey: {
          type: 'string',
          description: 'Optional: only requests of this form type, e.g. "leave" or "wfh". Omit for any type.',
        },
      },
      required: [],
    },
    argsSchema: queryMyRequestsArgsSchema,
    execute: async (tenantId, viewer, args): Promise<RequestListItemDto[]> => {
      // Self-scoped by `requesterId` inside `listMyRequests` itself — no permission check needed
      // here, unlike `queryUsers`/`queryAbsences` (seeing your own data is never a 403 case).
      const query = myRequestsQuerySchema.parse({ page: 1, pageSize: 20 });
      const result = await listMyRequests(tenantId, viewer.id, query);
      // `listMyRequests` only filters by `status` server-side — date/form-type filters are applied
      // here, in code, over its result, rather than asking the model to compute or match them.
      let rows = result.rows;
      if (args.formKey) rows = rows.filter((row) => row.formKey === args.formKey);
      if (args.range) {
        const { from, to } = resolveDateRange(args.range, args.rangeStart, args.rangeEnd);
        rows = rows.filter((row) => overlapsRange(row, from, to));
      }
      return rows;
    },
  }),
  defineTool<QueryDepartmentsArgs>({
    name: 'queryDepartments',
    description:
      'Answers questions about the tenant\'s DEPARTMENT master list — names, heads, member counts, and archived state (e.g. "what departments do we have?", "who heads Engineering?", "is Sales archived?"). NOT for who is on leave/WFH within a department (queryAbsences) or who belongs to it beyond its head (queryUsers with departmentId). Enterprise Admin, HR Head, Project Manager, or Tech Lead only.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text match against department name.' },
        archived: {
          type: 'boolean',
          description: 'Optional filter: true for archived only, false for active only. Omit for both.',
        },
      },
      required: [],
    },
    argsSchema: queryDepartmentsArgsSchema,
    execute: async (tenantId, viewer, args): Promise<DepartmentDto[]> => {
      // `listDepartments` itself enforces no permission check (today it's gated only by the
      // `requireAnyRole(ABSENCE_VIEWER_ROLES)` Express middleware on the REST route) — so the tool
      // executor adds the same check explicitly before touching any data.
      if (!DEPARTMENT_PROJECT_VIEWER_ROLES.some((role) => viewer.roles.includes(role))) {
        throw new HttpError(403, 'Enterprise Admin, HR Head, Project Manager, or Tech Lead access required');
      }
      const query: DepartmentsQuery = {
        page: 1,
        pageSize: 25, // capped so the narration prompt and any rendered table stay small
        search: args.search,
        archived: args.archived,
      };
      const result = await listDepartments(tenantId, query);
      return result.rows;
    },
  }),
  defineTool<QueryProjectsArgs>({
    name: 'queryProjects',
    description:
      'Answers questions about the tenant\'s PROJECT master list — names, status (active/archived), and each named project\'s own PM/Tech Lead/members (e.g. "what projects are active?", "who is the PM for Project Phoenix?"). NOT for a tenant-wide list of everyone who holds the Project Manager (or any other) role — that\'s the user directory, use queryUsers instead. Also NOT for who is on leave/WFH on a project (queryAbsences) or approvals awaiting the viewer (queryMyApprovals). Enterprise Admin, HR Head, Project Manager, or Tech Lead only.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text match against project name.' },
        status: {
          type: 'string',
          enum: ['active', 'archived'],
          description: 'Optional filter by project status. Omit for both.',
        },
      },
      required: [],
    },
    argsSchema: queryProjectsArgsSchema,
    execute: async (tenantId, viewer, args): Promise<ProjectDto[]> => {
      // Same reasoning as queryDepartments above: `listProjects` enforces no check of its own, so
      // the executor mirrors the REST route's `requireAnyRole(ABSENCE_VIEWER_ROLES)` gate here.
      if (!DEPARTMENT_PROJECT_VIEWER_ROLES.some((role) => viewer.roles.includes(role))) {
        throw new HttpError(403, 'Enterprise Admin, HR Head, Project Manager, or Tech Lead access required');
      }
      const query = projectsQuerySchema.parse({ page: 1, pageSize: 25, search: args.search, status: args.status });
      const result = await listProjects(tenantId, query);
      return result.rows;
    },
  }),
  defineTool<QueryHolidaysArgs>({
    name: 'queryHolidays',
    description:
      'Answers questions about the tenant\'s configured HOLIDAY calendar for a given year (e.g. "what holidays do we have this year?", "is there a holiday next month?"). NOT about staff leave/WFH (queryAbsences) or the viewer\'s own requests (queryMyRequests). Available to any authenticated user — holidays are visible tenant-wide, no role restriction.',
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Calendar year, e.g. 2026. Omit for the current year.' },
      },
      required: [],
    },
    argsSchema: queryHolidaysArgsSchema,
    execute: async (tenantId, _viewer, args): Promise<HolidayDto[]> => {
      // No permission gate: `holidays.routes.ts` leaves GET open to any authenticated user.
      const year = args.year ?? new Date().getFullYear();
      return listHolidays(tenantId, year);
    },
  }),
  defineTool<QueryMyLeaveBalancesArgs>({
    name: 'queryMyLeaveBalances',
    description:
      "Answers questions about the VIEWER'S OWN remaining or used leave balance per leave type (e.g. \"how many leave days do I have left?\", \"what's my sick leave balance?\"). ONLY for the viewer's own balance — never a colleague's (no tool answers that). Available to any authenticated user, no role restriction.",
    parameters: { type: 'object', properties: {}, required: [] },
    argsSchema: queryMyLeaveBalancesArgsSchema,
    execute: async (tenantId, viewer): Promise<LeaveBalanceDto[]> => {
      // Self-scoped by `userId` inside `getMyLeaveBalances` itself — no permission check needed,
      // same reasoning as queryMyRequests (seeing your own data is never a 403 case).
      return getMyLeaveBalances(tenantId, viewer.id);
    },
  }),
  defineTool<QueryMyApprovalsArgs>({
    name: 'queryMyApprovals',
    description:
      "Answers questions about requests awaiting the VIEWER'S OWN approval decision, or ones they've already approved/rejected (e.g. \"what's pending my approval?\", \"what have I approved recently?\"). ONLY for the viewer's own approver queue — for a colleague's request status use queryAbsences, and for the viewer's OWN submitted requests (the opposite direction — things they submitted, not things they need to decide on) use queryMyRequests instead, never this tool. Available to any authenticated user, no role restriction.",
    parameters: {
      type: 'object',
      properties: {
        tab: {
          type: 'string',
          enum: ['pending', 'decided'],
          description: 'Which queue to show: "pending" (awaiting the viewer\'s decision) or "decided" (already acted on). Defaults to "pending".',
        },
      },
      required: [],
    },
    argsSchema: queryMyApprovalsArgsSchema,
    execute: async (tenantId, viewer, args): Promise<ApprovalQueueItemDto[]> => {
      // Self-scoped by `approverId` inside `listApprovalQueue` itself — no permission check needed,
      // same reasoning as queryMyRequests/queryMyLeaveBalances.
      const query = approvalQueueQuerySchema.parse({ tab: args.tab });
      const result = await listApprovalQueue(tenantId, viewer.id, query);
      return result.rows;
    },
  }),
  defineTool<QueryFrontDeskVisitorsArgs>({
    name: 'queryFrontDeskVisitors',
    description:
      "Answers questions about TODAY's visitors at the front desk — who is expected, currently on-site, or already checked out, including their host and purpose (e.g. \"who's checked in right now?\", \"who's visiting today?\"). NOT for the viewer's own visitor request status (queryMyRequests) or a colleague's leave/WFH (queryAbsences). Enterprise Admin or HR Head only — the same two roles the Front Desk console itself is restricted to.",
    parameters: { type: 'object', properties: {}, required: [] },
    argsSchema: queryFrontDeskVisitorsArgsSchema,
    execute: async (tenantId, viewer): Promise<FrontDeskVisitorDto[]> => {
      // `getTodayView` itself enforces no permission check (today it's gated only by the
      // `requireFrontDeskAccess` Express middleware on the REST route) — so the tool executor adds
      // the same check explicitly before touching any data, same pattern as queryDepartments/queryProjects.
      if (!FRONT_DESK_VIEWER_ROLES.some((role) => viewer.roles.includes(role))) {
        throw new HttpError(403, 'Enterprise Admin or HR Head access required');
      }
      const { expected, onSite, checkedOut } = await getTodayView(tenantId);
      // Flattened into one array (this tool's only deviation from the raw REST shape, which splits
      // by lifecycle bucket): every row already carries `status`/`checkInAt`/`checkOutAt`, enough
      // for narration to state which bucket a visitor is in without a second, bucket-picking arg.
      return [...expected, ...onSite, ...checkedOut];
    },
  }),
];
