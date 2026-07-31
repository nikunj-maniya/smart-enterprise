import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SystemRoleKey } from '@se/shared';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import type { AuthedUser } from '../../middleware/auth.js';
import { handleSmartSearch } from './smart-search.service.js';
import { queryAbsencesArgsSchema, queryUsersArgsSchema, resolveDateRange } from './smart-search.tools.js';

// smart-search.tools.js transitively imports the BullMQ `redisConnection` (via queryMyRequests ->
// requests.service.js -> notifications.service.js -> slack-delivery.js), which connects eagerly
// and retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately (requests.service.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Orchestration unit tests for the tool-calling smart-search pipeline (see smart-search.service.ts
 * for the numbered steps). The LLM boundary (llm-client.ts) is stubbed at the `fetch` level —
 * exactly the same technique slack-client.test.ts uses for its own outbound-HTTP wrapper — so the
 * real `selectTool`/`narrate` code still runs, just against a canned `/chat/completions` response,
 * queued FIFO for the (at most two) round-trips per request. Prisma delegates reached by
 * `listAbsences`/`resolveAbsenceScope`/`listOrgUsers` are stubbed in-memory (absences.service.test.ts
 * / org-users.service.test.ts pattern) since CI has no live Postgres.
 *
 * IMPORTANT — no live Ollama instance exists in this environment: these tests only prove the
 * orchestration/permission/decline wiring is correct against canned LLM responses. A manual smoke
 * test against the user's own running Ollama instance is still required to validate real semantic
 * tool-selection/narration quality end-to-end.
 */

let llmResponses: unknown[] = [];
const llmCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
const realFetch = globalThis.fetch;

Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    llmCalls.push({ url, body });
    const next = llmResponses.shift();
    if (!next) throw new Error('No stubbed LLM response queued for this call');
    return { ok: true, status: 200, statusText: 'OK', json: async () => next } as Response;
  },
  configurable: true,
  writable: true,
});

after(() => {
  Object.defineProperty(globalThis, 'fetch', { value: realFetch, configurable: true, writable: true });
});

type RequestRow = {
  id: string;
  status: string;
  form: { key: string; title?: string };
  requester: { id: string; name: string };
  startDate: Date | null;
  endDate: Date | null;
  halfDayCount: number | null;
  departmentId: string | null;
  projectId: string | null;
  approvers: { decision: string | null }[];
  createdAt: Date;
  payload: unknown;
};

type UserRow = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  roles: { role: { id: string; name: string } }[];
  departments: { department: { id: string; name: string } }[];
};

type ConversationRow = {
  id: string;
  tenantId: string;
  userId: string;
  title: string | null;
  summary: string | null;
  summarizedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type MessageRow = { id: string; conversationId: string; role: string; content: string; createdAt: Date };
type MemoryRow = { id: string; tenantId: string; userId: string; content: string; createdAt: Date; updatedAt: Date };

let requestRows: RequestRow[] = [];
let projectRows: {
  id: string;
  name: string;
  status?: string;
  members?: { roleInProject: string; user: { id: string; name: string } }[];
}[] = [];
let departmentRows: { id: string; name: string }[] = [];
let projectMemberRows: { projectId: string }[] = [];
let userRows: UserRow[] = [];
let userCount = 0;
const auditCreateCalls: unknown[] = [];

// smart-search.service.ts now also persists chat history (conversation.service.ts) and retrieves/
// extracts long-term memory (memory.service.ts) — both stubbed here the same in-memory way as
// conversation.service.test.ts / memory.service.test.ts do it for their own suites, since there's
// no live Postgres in this environment.
let conversationRows: ConversationRow[] = [];
let messageRows: MessageRow[] = [];
let memoryRows: MemoryRow[] = [];
let nextConversationId = 1;
let nextMessageId = 1;
let nextMemoryId = 1;

Object.defineProperty(prisma, 'smartSearchConversation', {
  value: {
    findUnique: async (args: { where: { id: string } }) => conversationRows.find((c) => c.id === args.where.id) ?? null,
    create: async (args: { data: { tenantId: string; userId: string } }) => {
      const row: ConversationRow = {
        id: `c${nextConversationId++}`,
        title: null,
        summary: null,
        summarizedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      };
      conversationRows.push(row);
      return row;
    },
    update: async (args: { where: { id: string }; data: Partial<ConversationRow> }) => {
      const row = conversationRows.find((c) => c.id === args.where.id)!;
      Object.assign(row, args.data);
      return row;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'smartSearchMessage', {
  value: {
    findMany: async (args: { where: { conversationId: string; createdAt?: { gt: Date } } }) =>
      messageRows
        .filter(
          (m) =>
            m.conversationId === args.where.conversationId &&
            (!args.where.createdAt || m.createdAt > args.where.createdAt.gt),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    createMany: async (args: { data: Array<{ conversationId: string; role: string; content: string }> }) => {
      for (const d of args.data) {
        messageRows.push({ id: `m${nextMessageId++}`, createdAt: new Date(), ...d });
      }
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'smartSearchMemory', {
  value: {
    findMany: async (args: { where: { tenantId: string; userId: string } }) =>
      memoryRows.filter((m) => m.tenantId === args.where.tenantId && m.userId === args.where.userId),
    create: async (args: { data: { tenantId: string; userId: string; content: string } }) => {
      const row: MemoryRow = { id: `mem${nextMemoryId++}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      memoryRows.push(row);
      return row;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)),
  configurable: true,
});

function utc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// Computed off the real clock (same as `resolveDateRange`'s own default `now`) rather than a
// hardcoded literal — a fixed calendar date only matches "tomorrow" on the one day it was written
// for and fails permanently once that day passes.
const TOMORROW_ISO = resolveDateRange('tomorrow', undefined, undefined).from;

Object.defineProperty(prisma, 'request', {
  value: { findMany: async () => requestRows, count: async () => requestRows.length },
  configurable: true,
});
Object.defineProperty(prisma, 'project', {
  value: { findMany: async () => projectRows, count: async () => projectRows.length },
  configurable: true,
});
Object.defineProperty(prisma, 'department', {
  value: { findMany: async () => departmentRows },
  configurable: true,
});
Object.defineProperty(prisma, 'projectMember', {
  value: { findMany: async () => projectMemberRows },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async () => userRows,
    count: async () => userCount,
  },
  configurable: true,
});
Object.defineProperty(prisma, 'auditLog', {
  value: {
    create: async (args: unknown) => {
      auditCreateCalls.push(args);
      return {};
    },
  },
  configurable: true,
});

beforeEach(() => {
  llmResponses = [];
  llmCalls.length = 0;
  requestRows = [];
  projectRows = [];
  departmentRows = [];
  projectMemberRows = [];
  userRows = [];
  userCount = 0;
  auditCreateCalls.length = 0;
  conversationRows = [];
  messageRows = [];
  memoryRows = [];
});

function viewer(id: string, roles: string[]): AuthedUser {
  return { id, email: `${id}@t.test`, isSystemAdmin: false, tenantId: 't1', roles };
}

const HR = viewer('hr1', [SystemRoleKey.HrHead]);
const ADMIN = viewer('admin1', [SystemRoleKey.EnterpriseAdmin]);
const PM = viewer('pm1', [SystemRoleKey.ProjectManager]);
const EMPLOYEE = viewer('emp1', [SystemRoleKey.Employee]);

/** Canned "the model picked this tool" response for the tool-selection call. */
function toolCallResponse(name: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: 'call_1', function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
  };
}

/** Canned "the model picked no tool" response. */
function noToolResponse() {
  return { choices: [{ message: { content: 'no tool applies', tool_calls: [] } }] };
}

function narrateResponse(content: string) {
  return { choices: [{ message: { content, tool_calls: [] } }] };
}

/** Canned "the extraction call proposed no new facts" response — queued for turns that reach
 *  `extractSafely` (a tool matched, whether denied or answered; see smart-search.service.ts). */
function noMemoriesExtractedResponse() {
  return { choices: [{ message: { content: '[]', tool_calls: [] } }] };
}

function userRow(partial: Partial<UserRow> & Pick<UserRow, 'id' | 'name' | 'email'>): UserRow {
  return {
    tenantId: 't1',
    status: 'Active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [],
    departments: [],
    ...partial,
  };
}

function requestRow(partial: Partial<RequestRow> & Pick<RequestRow, 'form' | 'requester' | 'startDate' | 'endDate'>): RequestRow {
  return {
    id: 'r1',
    status: 'Approved',
    halfDayCount: null,
    departmentId: null,
    projectId: null,
    payload: {},
    approvers: [],
    createdAt: utc('2026-07-01'),
    ...partial,
    form: { title: 'Leave', ...partial.form },
  };
}

describe('handleSmartSearch — queryUsers (Enterprise Admin worked example)', () => {
  it('Enterprise Admin gets real, narrated user-directory data', async () => {
    userRows = [userRow({ id: 'u1', name: 'Alice Admin', email: 'alice@acme.test' })];
    userCount = 1;
    llmResponses = [
      toolCallResponse('queryUsers', {}),
      narrateResponse('Here is Alice Admin (alice@acme.test).'),
      noMemoriesExtractedResponse(),
    ];

    const result = await handleSmartSearch('t1', ADMIN, { message: 'list users in my company' });

    assert.equal(result.toolUsed, 'queryUsers');
    assert.equal(result.denied, false);
    assert.equal(result.reply, 'Here is Alice Admin (alice@acme.test).');
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { name: string }).name, 'Alice Admin');
    assert.ok(result.conversationId);
    // Three model round-trips: tool-selection, narration, then (best-effort) memory extraction.
    assert.equal(llmCalls.length, 3);
    assert.equal(auditCreateCalls.length, 1);
    assert.deepEqual((auditCreateCalls[0] as { data: { action: string } }).data.action, 'answered');
  });

  it('an Employee asking the identical question gets the generic decline string, never real rows', async () => {
    userRows = [userRow({ id: 'u1', name: 'Alice Admin', email: 'alice@acme.test' })];
    userCount = 1;
    // The model still proposes the same tool call — the executor's own permission check is what
    // must reject it, regardless of what the model picks.
    llmResponses = [toolCallResponse('queryUsers', {}), noMemoriesExtractedResponse()];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: 'list users in my company' });

    assert.equal(result.reply, "You don't have permission to view this information.");
    assert.equal(result.denied, true);
    assert.equal(result.toolUsed, 'queryUsers');
    assert.deepEqual(result.rows, []);
    assert.ok(result.conversationId);
    // Denial short-circuits before the narration call — tool-selection, then memory extraction.
    assert.equal(llmCalls.length, 2);
    assert.equal((auditCreateCalls[0] as { data: { action: string } }).data.action, 'denied');
  });
});

describe('handleSmartSearch — queryAbsences (HR / PM-TL scoped, Employee denied)', () => {
  it('HR Head gets correct people + day counts for a leave question', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Jane Doe' },
        startDate: utc('2026-08-03'),
        endDate: utc('2026-08-05'),
      }),
    ];
    llmResponses = [
      toolCallResponse('queryAbsences', { range: 'next_week' }),
      narrateResponse('Jane Doe is on leave for 3 days.'),
    ];

    const result = await handleSmartSearch('t1', HR, { message: 'who is on leave next week' });

    assert.equal(result.toolUsed, 'queryAbsences');
    assert.equal(result.denied, false);
    assert.equal(result.reply, 'Jane Doe is on leave for 3 days.');
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { personName: string }).personName, 'Jane Doe');

    // Day-count arithmetic is computed in application code and handed to the narration call as an
    // already-computed fact — the model is never asked to do the math itself.
    const narrationCallBody = llmCalls[1].body as { messages: Array<{ content: string }> };
    const dataMessage = narrationCallBody.messages.find((m) => m.content.includes('Data (JSON)'))!;
    assert.match(dataMessage.content, /"totalDays":3/);
    // `AbsenceEntryDto` never carries a `status` field (every row is approved by construction of
    // `listAbsences`'s own query) — without stating that fact explicitly, a question like "is X's
    // leave approved?" got "the data doesn't include approval status" even though it's always true.
    assert.match(dataMessage.content, /"status":"Approved"/);
  });

  it('a PM/Tech Lead scoped to their own projects gets a correctly-scoped answer', async () => {
    projectMemberRows = [{ projectId: 'proj-1' }];
    requestRows = [
      requestRow({
        form: { key: 'wfh' },
        requester: { id: 'p2', name: 'Bob' },
        startDate: utc('2026-08-04'),
        endDate: utc('2026-08-04'),
        projectId: 'proj-1',
      }),
    ];
    llmResponses = [
      toolCallResponse('queryAbsences', { range: 'next_week', type: 'wfh' }),
      narrateResponse('Bob is on WFH for 1 day.'),
    ];

    const result = await handleSmartSearch('t1', PM, { message: 'who is on WFH next week on my projects' });

    assert.equal(result.toolUsed, 'queryAbsences');
    assert.equal(result.rows.length, 1);
    assert.equal(result.reply, 'Bob is on WFH for 1 day.');
  });

  it('an Employee with no absence-viewer role gets the generic decline string', async () => {
    llmResponses = [toolCallResponse('queryAbsences', { range: 'next_week' }), noMemoriesExtractedResponse()];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: 'who is on leave next week' });

    assert.equal(result.reply, "You don't have permission to view this information.");
    assert.equal(result.denied, true);
    assert.deepEqual(result.rows, []);
    assert.equal(llmCalls.length, 2);
  });

  it('a named colleague\'s leave status resolves the name to their requests, with no date given', async () => {
    userRows = [userRow({ id: 'p9', name: 'Full Stack Nikunj', email: 'nikunj+fullstack@gmail.com' })];
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p9', name: 'Full Stack Nikunj' },
        startDate: utc('2026-08-01'),
        endDate: utc('2026-08-01'),
        status: 'Approved',
      }),
    ];
    // No `range` supplied — the question ("does X's leave is approved") has no date to give.
    llmResponses = [
      toolCallResponse('queryAbsences', { personName: 'Full Stack Nikunj' }),
      narrateResponse('Yes — Full Stack Nikunj\'s leave is Approved.'),
    ];

    const result = await handleSmartSearch('t1', ADMIN, { message: "Does Full Stack Nikunj's Leave is approved?" });

    assert.equal(result.toolUsed, 'queryAbsences');
    assert.equal(result.denied, false);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { personName: string }).personName, 'Full Stack Nikunj');
  });

  it('a name that matches nobody in the directory returns no rows rather than the wrong person\'s data', async () => {
    userRows = []; // no directory match
    llmResponses = [
      toolCallResponse('queryAbsences', { personName: 'Nobody Real' }),
      narrateResponse('No matching person was found.'),
    ];

    const result = await handleSmartSearch('t1', ADMIN, { message: "Is Nobody Real's leave approved?" });

    assert.deepEqual(result.rows, []);
  });
});

describe('handleSmartSearch — queryProjects (PM lookup)', () => {
  it('a Project Manager asking who manages a project gets the correct PM named in the narrated reply', async () => {
    projectRows = [
      {
        id: 'proj-1',
        name: 'Project Phoenix',
        status: 'active',
        members: [{ roleInProject: 'PM', user: { id: 'pm2', name: 'Priya Manager' } }],
      },
    ];
    llmResponses = [
      toolCallResponse('queryProjects', { search: 'Project Phoenix' }),
      narrateResponse('The project manager of Project Phoenix is Priya Manager.'),
    ];

    const result = await handleSmartSearch('t1', PM, { message: 'who is the project manager of Project Phoenix' });

    assert.equal(result.toolUsed, 'queryProjects');
    assert.equal(result.denied, false);
    assert.equal(result.reply, 'The project manager of Project Phoenix is Priya Manager.');
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { pm: { name: string } | null }).pm?.name, 'Priya Manager');
  });
});

describe('handleSmartSearch — queryMyRequests (any authenticated user, self-scoped)', () => {
  it('an Employee asking about their own leave request gets its real status — not a permission decline', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave', title: 'Leave' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc('2026-07-29'),
        endDate: utc('2026-07-29'),
        status: 'Pending Approval',
      }),
    ];
    llmResponses = [
      toolCallResponse('queryMyRequests', {}),
      narrateResponse('Your leave request for tomorrow (2026-07-29) is Pending Approval.'),
    ];

    const result = await handleSmartSearch('t1', EMPLOYEE, {
      message: 'what is the status of my leave request for tomorrow?',
    });

    assert.equal(result.toolUsed, 'queryMyRequests');
    assert.equal(result.denied, false);
    assert.equal(result.reply, 'Your leave request for tomorrow (2026-07-29) is Pending Approval.');
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { status: string }).status, 'Pending Approval');
  });

  it('is available to every role — no permission check exists for viewing your own requests', async () => {
    llmResponses = [toolCallResponse('queryMyRequests', {}), narrateResponse('You have no requests on file.')];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: 'what are my requests?' });

    assert.equal(result.denied, false);
    assert.equal(result.toolUsed, 'queryMyRequests');
  });

  it('a question scoped to one day returns only the matching request, not the viewer\'s whole history', async () => {
    requestRows = [
      requestRow({
        id: 'tomorrow-leave',
        form: { key: 'leave' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc(TOMORROW_ISO),
        endDate: utc(TOMORROW_ISO),
        status: 'Approved',
      }),
      requestRow({
        id: 'old-completed-leave',
        form: { key: 'leave' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc('2026-07-15'),
        endDate: utc('2026-07-15'),
        status: 'Completed',
      }),
      requestRow({
        id: 'unrelated-withdrawn-leave',
        form: { key: 'leave' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc('2026-12-01'),
        endDate: utc('2026-12-01'),
        status: 'Withdrawn',
      }),
    ];
    llmResponses = [
      toolCallResponse('queryMyRequests', { range: 'tomorrow' }),
      narrateResponse('Your leave request for tomorrow is Approved.'),
    ];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: 'what about my tomorrow leave request status?' });

    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { id: string }).id, 'tomorrow-leave');
  });

  it('a question naming a specific form type excludes same-day requests of a different type', async () => {
    requestRows = [
      requestRow({
        id: 'tomorrow-leave',
        form: { key: 'leave' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc(TOMORROW_ISO),
        endDate: utc(TOMORROW_ISO),
        status: 'Approved',
      }),
      requestRow({
        id: 'tomorrow-wfh',
        form: { key: 'wfh' },
        requester: { id: EMPLOYEE.id, name: 'Leave Employee' },
        startDate: utc(TOMORROW_ISO),
        endDate: utc(TOMORROW_ISO),
        status: 'Approved',
      }),
    ];
    llmResponses = [
      toolCallResponse('queryMyRequests', { range: 'tomorrow', formKey: 'leave' }),
      narrateResponse('Your leave request for tomorrow is Approved.'),
    ];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: 'what about my tomorrow Leave request status?' });

    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { id: string }).id, 'tomorrow-leave');
  });
});

describe('handleSmartSearch — out-of-scope / no-match declines', () => {
  it('a question unrelated to any tool gets the fixed out-of-scope decline, never a hallucinated answer', async () => {
    llmResponses = [noToolResponse()];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: "what's the weather today" });

    assert.equal(
      result.reply,
      'I can only help with information available in smartEnterprise — try asking about staff leave/WFH, the user directory, or your own requests.',
    );
    assert.equal(result.toolUsed, null);
    assert.equal(result.denied, false);
    assert.deepEqual(result.rows, []);
    // No tool picked → no second (narration) model call.
    assert.equal(llmCalls.length, 1);
    assert.equal((auditCreateCalls[0] as { data: { entityId: string } }).data.entityId, 'unmatched');
  });

  it('a tool name the model invents (not in the registry) is treated the same as no tool', async () => {
    llmResponses = [toolCallResponse('deleteEverything', {})];

    const result = await handleSmartSearch('t1', ADMIN, { message: 'do something weird' });

    assert.equal(result.toolUsed, null);
    assert.match(result.reply, /I can only help with information available in smartEnterprise/);
    assert.equal(llmCalls.length, 1);
  });

  it('arguments that fail the matched tool\'s own zod schema are treated the same as no tool, without retrying', async () => {
    // "custom" range requires rangeStart/rangeEnd per the tool's own argsSchema refinement.
    llmResponses = [toolCallResponse('queryAbsences', { range: 'custom' })];

    const result = await handleSmartSearch('t1', HR, { message: 'who was on leave from x to y' });

    assert.equal(result.toolUsed, null);
    assert.match(result.reply, /I can only help with information available in smartEnterprise/);
    assert.equal(llmCalls.length, 1);
  });
});

describe('handleSmartSearch — persistent history, memory injection, compaction', () => {
  it('persists a brand-new thread and returns its conversationId, even on a decline', async () => {
    llmResponses = [noToolResponse()];

    const result = await handleSmartSearch('t1', EMPLOYEE, { message: "what's the weather today" });

    assert.ok(result.conversationId);
    assert.equal(conversationRows.length, 1);
    assert.equal(conversationRows[0].id, result.conversationId);
    assert.equal(messageRows.filter((m) => m.conversationId === result.conversationId).length, 2);
  });

  it('appends to the same thread on a second call with the returned conversationId', async () => {
    llmResponses = [noToolResponse()];
    const first = await handleSmartSearch('t1', EMPLOYEE, { message: 'first question' });

    llmResponses = [noToolResponse()];
    const second = await handleSmartSearch('t1', EMPLOYEE, {
      message: 'second question',
      conversationId: first.conversationId,
    });

    assert.equal(second.conversationId, first.conversationId);
    assert.equal(conversationRows.length, 1);
    assert.equal(messageRows.filter((m) => m.conversationId === first.conversationId).length, 4);
  });

  it('resuming a conversationId loads its persisted history instead of the request\'s own `history`', async () => {
    conversationRows = [
      {
        id: 'c1',
        tenantId: 't1',
        userId: EMPLOYEE.id,
        title: 'Existing thread',
        summary: null,
        summarizedUntil: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ];
    messageRows = [
      { id: 'm1', conversationId: 'c1', role: 'user', content: 'stored turn', createdAt: new Date('2026-07-01T00:00:01.000Z') },
    ];
    llmResponses = [noToolResponse()];

    await handleSmartSearch('t1', EMPLOYEE, {
      message: 'anything else?',
      conversationId: 'c1',
      history: [{ role: 'user', content: 'this should be ignored' }],
    });

    const selectCallBody = llmCalls[0].body as { messages: Array<{ content: string }> };
    assert.ok(selectCallBody.messages.some((m) => m.content === 'stored turn'));
    assert.ok(!selectCallBody.messages.some((m) => m.content === 'this should be ignored'));
  });

  it("rejects resuming another user's thread (ownership-checked the same as the conversation routes)", async () => {
    conversationRows = [
      {
        id: 'c1',
        tenantId: 't1',
        userId: 'someone-else',
        title: 'Not mine',
        summary: null,
        summarizedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await assert.rejects(
      () => handleSmartSearch('t1', EMPLOYEE, { message: 'hi', conversationId: 'c1' }),
      /Conversation not found/,
    );
  });

  it('injects remembered facts into the tool-selection call on a thread\'s first turn only', async () => {
    memoryRows = [
      { id: 'mem1', tenantId: 't1', userId: EMPLOYEE.id, content: 'Prefers WFH over office', createdAt: new Date(), updatedAt: new Date() },
    ];
    llmResponses = [noToolResponse()];

    await handleSmartSearch('t1', EMPLOYEE, { message: 'anything to note?' });

    const selectCallBody = llmCalls[0].body as { messages: Array<{ content: string }> };
    assert.ok(selectCallBody.messages.some((m) => m.content.includes('Prefers WFH over office')));
  });

  it('does not re-inject memory once a thread already has history', async () => {
    memoryRows = [
      { id: 'mem1', tenantId: 't1', userId: EMPLOYEE.id, content: 'Prefers WFH over office', createdAt: new Date(), updatedAt: new Date() },
    ];
    llmResponses = [noToolResponse()];

    await handleSmartSearch('t1', EMPLOYEE, {
      message: 'follow-up',
      history: [{ role: 'user', content: 'earlier turn' }],
    });

    const selectCallBody = llmCalls[0].body as { messages: Array<{ content: string }> };
    assert.ok(!selectCallBody.messages.some((m) => m.content.includes('Prefers WFH over office')));
  });

  it('compacts a thread into a rolling summary once its unsummarized tail grows past the threshold', async () => {
    conversationRows = [
      {
        id: 'c1',
        tenantId: 't1',
        userId: EMPLOYEE.id,
        title: 'Long thread',
        summary: null,
        summarizedUntil: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ];
    // 24 existing messages is exactly the compaction threshold — one more turn (2 messages) tips
    // it over, so this exercises the summarization branch of maybeCompact.
    messageRows = Array.from({ length: 24 }, (_, i) => ({
      id: `m${i}`,
      conversationId: 'c1',
      role: (i % 2 === 0 ? 'user' : 'assistant') as string,
      content: `turn ${i}`,
      createdAt: new Date(2026, 6, 1, 0, 0, i),
    }));
    llmResponses = [noToolResponse(), narrateResponse('Rolled-up summary of the older turns.')];

    await handleSmartSearch('t1', EMPLOYEE, { message: 'one more question', conversationId: 'c1' });

    assert.equal(conversationRows[0].summary, 'Rolled-up summary of the older turns.');
    assert.ok(conversationRows[0].summarizedUntil instanceof Date);
  });
});

describe('handleSmartSearch — conversation history', () => {
  it('trims history to the most recent 8 messages before sending it to the model', async () => {
    llmResponses = [noToolResponse()];
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }));

    await handleSmartSearch('t1', EMPLOYEE, { message: 'anything else?', history });

    const selectCallBody = llmCalls[0].body as { messages: Array<{ role: string; content: string }> };
    // last 8 history turns + the new user message (instruction folded into the user turn, not a
    // separate system message — see smart-search.service.ts for why).
    assert.equal(selectCallBody.messages.length, 8 + 1);
    assert.equal(selectCallBody.messages[0].content, 'turn 4');
    assert.match(selectCallBody.messages.at(-1)!.content, /anything else\?$/);
  });
});

describe('code inspection — tool argument schemas never carry a tenant/viewer id', () => {
  it('queryAbsences args schema has no tenantId/userId/viewerId field', () => {
    const shape = (queryAbsencesArgsSchema._def.schema as { shape: Record<string, unknown> }).shape;
    assert.deepEqual(
      Object.keys(shape).filter((k) => /tenant|viewer|userid/i.test(k)),
      [],
    );
  });

  it('queryUsers args schema has no tenantId/userId/viewerId field', () => {
    const shape = queryUsersArgsSchema.shape;
    assert.deepEqual(
      Object.keys(shape).filter((k) => /tenant|viewer|userid/i.test(k)),
      [],
    );
  });
});
