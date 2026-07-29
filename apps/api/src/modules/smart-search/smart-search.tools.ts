import { z } from 'zod';
import {
  SystemRoleKey,
  absenceTypeSchema,
  myRequestsQuerySchema,
  orgUsersQuerySchema,
  userStatus,
  type AbsenceEntryDto,
  type OrgUserDto,
  type RequestListItemDto,
  type SmartSearchToolName,
} from '@se/shared';
import { HttpError } from '../../lib/http-error.js';
import { listAbsences } from '../absences/absences.service.js';
import type { Viewer } from '../requests/visibility-policy.js';
import { listOrgUsers } from '../org-users/org-users.service.js';
import { listMyRequests } from '../requests/requests.service.js';
import { searchDirectoryUsers } from '../directory/directory.service.js';

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
      'Answers questions about the tenant user directory — list, search, or filter employees by name/email, status, or department. Enterprise Admin only.',
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
      const query = orgUsersQuerySchema.parse({
        page: 1,
        pageSize: 25, // capped so the narration prompt and any rendered table stay small
        search: args.search,
        status: args.status,
        departmentId: args.departmentId,
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
];
