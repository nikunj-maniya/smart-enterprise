import type { AbsenceEntryDto, SmartSearchChatMessage, SmartSearchRequest, SmartSearchResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import type { AuthedUser } from '../../middleware/auth.js';
import { narrate, selectTool, type LlmChatMessage } from './llm-client.js';
import { SMART_SEARCH_TOOLS, toIsoDate } from './smart-search.tools.js';

/** Fixed, hardcoded strings — never model-generated, never the raw error. Every permission
 *  denial across every domain/tool produces the exact same one decline string. */
const DECLINE_OUT_OF_SCOPE =
  'I can only help with information available in smartEnterprise — try asking about staff leave/WFH, the user directory, or your own requests.';
const DECLINE_FORBIDDEN = "You don't have permission to view this information.";

/** Bounds latency/prompt size — only the most recent turns of the thread are sent to the model. */
const MAX_HISTORY_MESSAGES = 8;

const SELECT_SYSTEM_PROMPT =
  'You are the smartEnterprise assistant. Decide, from the conversation, whether one of the provided tools can answer the latest user question. Only call a tool when it directly applies; otherwise call no tool.';

const NARRATE_SYSTEM_PROMPT =
  'You are the smartEnterprise assistant. Using ONLY the structured data provided, give a short, plain-language answer to the question. Do not invent names, numbers, or dates that are not present in the data. If the data is empty, say so plainly.';

function trimHistory(history: SmartSearchChatMessage[]): LlmChatMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
}

/** Inclusive day count between two `YYYY-MM-DD` calendar days — computed here in application
 *  code, never asked of the model (per the "no model arithmetic" rule). */
function inclusiveDayCount(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** The rows returned to the client stay exactly `AbsenceEntryDto`/`OrgUserDto` shaped (per the
 *  shared response schema); the narration prompt gets an augmented copy with the day count already
 *  computed, so the model only ever restates a fact instead of calculating one.
 *
 *  `status: 'Approved'` is added here rather than being part of `AbsenceEntryDto` itself: every
 *  row `listAbsences` returns is already filtered to approved requests (it's baked into the
 *  query's own `WHERE`, not a field on the row) — so it's true by construction, but the model
 *  can't state a fact that was never actually present in the JSON it was given. Verified live:
 *  asking "is X's leave approved?" got "the data doesn't include approval status" without this,
 *  even though every returned row is, by definition, an approved one. */
function absencesNarrationFacts(rows: AbsenceEntryDto[]): unknown[] {
  return rows.map((r) => ({ ...r, totalDays: inclusiveDayCount(r.startDate, r.endDate), status: 'Approved' }));
}

async function logAudit(
  tenantId: string,
  actorId: string,
  toolUsed: string | null,
  denied: boolean,
  message: string,
): Promise<void> {
  // Never log the narrated answer text (it may echo an HR-only "reason" field) — the question,
  // which tool matched, and the denied flag are enough for the audit trail.
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId,
      entity: 'SmartSearch',
      entityId: toolUsed ?? 'unmatched',
      action: denied ? 'denied' : 'answered',
      after: { message, toolUsed },
    },
  });
}

/**
 * POST /smart-search orchestration (tool-calling, never text-to-SQL/RAG):
 *  1. Ask the model to pick at most one tool from the static registry.
 *  2. No tool picked / unrecognized name → fixed out-of-scope decline, no further model call.
 *  3. Zod-validate the picked tool's args → invalid → same fixed decline, no retry.
 *  4. Call that tool's executor — tenantId/viewer always come from the authenticated request,
 *     never from the model's output.
 *  5. Executor throws HttpError(403) → fixed, generic permission-decline string, never the raw
 *     error, never real data.
 *  6. Otherwise → one narration call over the structured result, then return it.
 * At most two model round-trips per question (tool-selection, then narration).
 */
export async function handleSmartSearch(
  tenantId: string,
  viewer: AuthedUser,
  request: SmartSearchRequest,
): Promise<SmartSearchResponse> {
  const history = trimHistory(request.history ?? []);
  // The instruction is folded into the latest user turn rather than sent as a separate `system`
  // message: verified live against Ollama's OpenAI-compat endpoint that a `system` role message
  // combined with `tools` unreliably drops tool_calls entirely (confirmed reproducible, 0/3 runs
  // returned a tool call with a system message present vs. 6/6 with the instruction folded in) —
  // narration is unaffected since that call never sends `tools`.
  const selectMessages: LlmChatMessage[] = [
    ...history,
    { role: 'user', content: `${SELECT_SYSTEM_PROMPT}\n\nQuestion: ${request.message}` },
  ];

  const toolSchemas = SMART_SEARCH_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  const toolCall = await selectTool(selectMessages, toolSchemas);
  const matched = toolCall ? SMART_SEARCH_TOOLS.find((t) => t.name === toolCall.function.name) : undefined;

  if (!toolCall || !matched) {
    await logAudit(tenantId, viewer.id, null, false, request.message);
    return { reply: DECLINE_OUT_OF_SCOPE, toolUsed: null, denied: false, rows: [] };
  }

  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    await logAudit(tenantId, viewer.id, null, false, request.message);
    return { reply: DECLINE_OUT_OF_SCOPE, toolUsed: null, denied: false, rows: [] };
  }

  const parsedArgs = matched.argsSchema.safeParse(rawArgs);
  if (!parsedArgs.success) {
    await logAudit(tenantId, viewer.id, null, false, request.message);
    return { reply: DECLINE_OUT_OF_SCOPE, toolUsed: null, denied: false, rows: [] };
  }

  let rows: unknown[];
  try {
    rows = await matched.execute(tenantId, viewer, parsedArgs.data);
  } catch (err) {
    if (err instanceof HttpError && err.status === 403) {
      await logAudit(tenantId, viewer.id, matched.name, true, request.message);
      // `rows: []` trivially satisfies either arm of the discriminated union below regardless of
      // which tool was denied — the cast just tells TS what the registry already guarantees.
      return { reply: DECLINE_FORBIDDEN, toolUsed: matched.name, denied: true, rows: [] } as SmartSearchResponse;
    }
    throw err;
  }

  // `rows` was erased to `unknown[]` when it crossed the tool-registry boundary (`defineTool`'s
  // single, documented cast point in smart-search.tools.ts). The registry guarantees `execute` for
  // `queryAbsences` always resolves `AbsenceEntryDto[]` and for `queryUsers` always `OrgUserDto[]` —
  // that invariant, not `any`, is what the casts below rely on.
  const narrationFacts = matched.name === 'queryAbsences' ? absencesNarrationFacts(rows as AbsenceEntryDto[]) : rows;
  // Dates in `narrationFacts` are absolute (e.g. "2026-07-29") — without being told what "today"
  // actually is, the model has no way to resolve a relative reference in the question itself
  // ("tomorrow", "next week") against them. Verified live: omitting this caused the model to claim
  // "no matching request" for `queryMyRequests` even when the exact row was right there in the data,
  // because it had no anchor to judge which date "tomorrow" meant.
  const reply = await narrate([
    { role: 'system', content: NARRATE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Today's date is ${toIsoDate(new Date())}.\n\nQuestion: ${request.message}\n\nData (JSON):\n${JSON.stringify(narrationFacts)}`,
    },
  ]);

  await logAudit(tenantId, viewer.id, matched.name, false, request.message);
  return { reply, toolUsed: matched.name, denied: false, rows } as SmartSearchResponse;
}
