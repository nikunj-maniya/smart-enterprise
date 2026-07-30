import type { AbsenceEntryDto, SmartSearchChatMessage, SmartSearchRequest, SmartSearchResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import type { AuthedUser } from '../../middleware/auth.js';
import { narrate, selectTool, summarizeConversation, type LlmChatMessage } from './llm-client.js';
import { SMART_SEARCH_TOOLS, toIsoDate } from './smart-search.tools.js';
import * as conversationService from './conversation.service.js';
import * as memoryService from './memory.service.js';

/** Fixed, hardcoded strings — never model-generated, never the raw error. Every permission
 *  denial across every domain/tool produces the exact same one decline string. */
const DECLINE_OUT_OF_SCOPE =
  'I can only help with information available in smartEnterprise — try asking about staff leave/WFH, the user directory, or your own requests.';
const DECLINE_FORBIDDEN = "You don't have permission to view this information.";

/** Bounds latency/prompt size — only the most recent turns of the thread are sent to the model. */
const MAX_HISTORY_MESSAGES = 8;

/** Once a persisted thread's unsummarized tail grows past this many messages, it gets compacted
 *  (see `maybeCompact` below) — comfortably larger than `MAX_HISTORY_MESSAGES` so compaction only
 *  fires occasionally on a long-running thread, not on every turn once it's crossed once. */
const SUMMARIZE_AFTER_MESSAGES = 24;

const SELECT_SYSTEM_PROMPT =
  'You are the smartEnterprise assistant. Decide, from the conversation, whether one of the provided tools can answer the latest user question. Only call a tool when it directly applies; otherwise call no tool.';

const NARRATE_SYSTEM_PROMPT =
  'You are the smartEnterprise assistant. Using ONLY the structured data provided, give a short, plain-language answer to the question. Do not invent names, numbers, or dates that are not present in the data. If the data is empty, say so plainly.';

function toLlmMessages(history: SmartSearchChatMessage[]): LlmChatMessage[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

/** Trims raw history to the most recent turns, then prepends the thread's rolling summary (if any)
 *  as a synthetic leading turn — the compaction counterpart of `MAX_HISTORY_MESSAGES`'s sliding
 *  window (see `maybeCompact` below and `SmartSearchConversation` in schema.prisma). */
function buildModelHistory(rawMessages: LlmChatMessage[], summary: string | null): LlmChatMessage[] {
  const recent = rawMessages.slice(-MAX_HISTORY_MESSAGES);
  if (!summary) return recent;
  return [
    { role: 'assistant', content: `(Summary of earlier parts of this conversation, for context only: ${summary})` },
    ...recent,
  ];
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

/** Persists a decline turn (no tool matched / unusable tool args) and returns the response the
 *  caller sends back — the three early-decline call sites below only differ in audit metadata,
 *  never in this shape. */
async function persistDecline(
  tenantId: string,
  viewer: AuthedUser,
  request: SmartSearchRequest,
  replyText: string,
): Promise<SmartSearchResponse> {
  await logAudit(tenantId, viewer.id, null, false, request.message);
  const conversationId = await conversationService.appendTurn(tenantId, viewer.id, request.conversationId, [
    { role: 'user', content: request.message },
    { role: 'assistant', content: replyText },
  ]);
  await maybeCompact(tenantId, viewer.id, conversationId);
  return { reply: replyText, conversationId, toolUsed: null, denied: false, rows: [] };
}

/** Runs long-term-memory extraction once, at the end of a turn, sequentially — never concurrently
 *  with the select/narrate calls already made for this same turn, same low-frequency guidance as
 *  memory.service.ts's own docstring. Only called for a genuinely in-scope turn (a tool matched,
 *  whether granted or denied) — an out-of-scope decline carries no data worth extracting from, and
 *  skipping it there keeps the added-latency cost to turns that actually exercised the assistant.
 *  Failures are swallowed: a broken extraction call must never fail the user's turn. */
async function extractSafely(tenantId: string, userId: string, question: string, reply: string): Promise<void> {
  try {
    await memoryService.extractAndStoreMemories(tenantId, userId, [
      { role: 'user', content: question },
      { role: 'assistant', content: reply },
    ]);
  } catch {
    // Best-effort — never let it fail the turn it rode in on.
  }
}

/** Folds a thread's older messages into its rolling `summary` once the unsummarized tail grows
 *  past `SUMMARIZE_AFTER_MESSAGES`, keeping only the most recent `MAX_HISTORY_MESSAGES` raw for
 *  future turns — the write side of context management (see `SmartSearchConversation` in
 *  schema.prisma). One extra local LLM call, but only on the rare turn that actually crosses the
 *  threshold, so it stays infrequent even on a very long-running thread. Failures are swallowed,
 *  same reasoning as `extractSafely` above — compaction is an optimization, never something the
 *  user's reply depends on. */
async function maybeCompact(tenantId: string, userId: string, conversationId: string): Promise<void> {
  try {
    const context = await conversationService.getConversationForOrchestration(tenantId, userId, conversationId);
    if (context.messages.length <= SUMMARIZE_AFTER_MESSAGES) return;

    const toFold = context.messages.slice(0, context.messages.length - MAX_HISTORY_MESSAGES);
    if (toFold.length === 0) return;

    const newSummary = await summarizeConversation(
      context.summary,
      toFold.map((m) => ({ role: m.role, content: m.content })),
    );
    await conversationService.compactConversation(
      tenantId,
      userId,
      conversationId,
      newSummary,
      toFold[toFold.length - 1].createdAt,
    );
  } catch {
    // Best-effort — never let it fail the turn it rode in on.
  }
}

/**
 * POST /smart-search orchestration (tool-calling, never text-to-SQL/RAG):
 *  1. Load this turn's context — either a persisted thread's own stored history (resuming via
 *     `conversationId`, server-trusted, the client's own `history` ignored) or the client-supplied
 *     ephemeral `history` for a thread that hasn't been persisted yet.
 *  2. On a thread's first turn, fetch this user's long-term memory and fold it into context.
 *  3. Ask the model to pick at most one tool from the static registry.
 *  4. No tool picked / unrecognized name → fixed out-of-scope decline, no further model call.
 *  5. Zod-validate the picked tool's args → invalid → same fixed decline, no retry.
 *  6. Call that tool's executor — tenantId/viewer always come from the authenticated request,
 *     never from the model's output.
 *  7. Executor throws HttpError(403) → fixed, generic permission-decline string, never the raw
 *     error, never real data.
 *  8. Otherwise → one narration call over the structured result, then return it.
 * Every path persists the turn (so the thread survives refresh) and returns the thread's
 * `conversationId`; a matched tool (denied or answered) also runs memory extraction and,
 * infrequently, thread compaction — see `extractSafely`/`maybeCompact` above for why those are
 * gated the way they are. At most two tool-calling-flow model round-trips per question
 * (tool-selection, then narration) plus, occasionally, one more for extraction/compaction.
 */
export async function handleSmartSearch(
  tenantId: string,
  viewer: AuthedUser,
  request: SmartSearchRequest,
): Promise<SmartSearchResponse> {
  // Resuming a persisted thread: its own stored messages/summary are the source of truth, not the
  // request's `history` field (see smartSearchRequestSchema's own comment in @se/shared). A brand
  // new thread (no conversationId yet) uses the client-supplied ephemeral history instead.
  let rawMessages: LlmChatMessage[];
  let summary: string | null;
  let isNewConversation: boolean;
  if (request.conversationId) {
    const context = await conversationService.getConversationForOrchestration(tenantId, viewer.id, request.conversationId);
    rawMessages = context.messages.map((m) => ({ role: m.role, content: m.content }));
    summary = context.summary;
    isNewConversation = context.messages.length === 0;
  } else {
    rawMessages = toLlmMessages(request.history ?? []);
    summary = null;
    isNewConversation = rawMessages.length === 0;
  }
  const history = buildModelHistory(rawMessages, summary);

  // Long-term memory is only retrieved/injected on a thread's first turn — cheap (no LLM call,
  // just a scoped read) but folded into the same per-turn budget note as extraction/compaction:
  // it only runs once per thread, not on every message.
  let memoryPreamble = '';
  if (isNewConversation) {
    const memories = await memoryService.getMemoryContextForUser(tenantId, viewer.id);
    if (memories.length > 0) {
      memoryPreamble = `What you already know about this user, from past conversations: ${memories.join('; ')}.\n\n`;
    }
  }

  // The instruction is folded into the latest user turn rather than sent as a separate `system`
  // message: verified live against Ollama's OpenAI-compat endpoint that a `system` role message
  // combined with `tools` unreliably drops tool_calls entirely (confirmed reproducible, 0/3 runs
  // returned a tool call with a system message present vs. 6/6 with the instruction folded in) —
  // narration is unaffected since that call never sends `tools`.
  const selectMessages: LlmChatMessage[] = [
    ...history,
    { role: 'user', content: `${memoryPreamble}${SELECT_SYSTEM_PROMPT}\n\nQuestion: ${request.message}` },
  ];

  const toolSchemas = SMART_SEARCH_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  const toolCall = await selectTool(selectMessages, toolSchemas);
  const matched = toolCall ? SMART_SEARCH_TOOLS.find((t) => t.name === toolCall.function.name) : undefined;

  if (!toolCall || !matched) {
    return persistDecline(tenantId, viewer, request, DECLINE_OUT_OF_SCOPE);
  }

  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return persistDecline(tenantId, viewer, request, DECLINE_OUT_OF_SCOPE);
  }

  const parsedArgs = matched.argsSchema.safeParse(rawArgs);
  if (!parsedArgs.success) {
    return persistDecline(tenantId, viewer, request, DECLINE_OUT_OF_SCOPE);
  }

  let rows: unknown[];
  try {
    rows = await matched.execute(tenantId, viewer, parsedArgs.data);
  } catch (err) {
    if (err instanceof HttpError && err.status === 403) {
      await logAudit(tenantId, viewer.id, matched.name, true, request.message);
      const conversationId = await conversationService.appendTurn(tenantId, viewer.id, request.conversationId, [
        { role: 'user', content: request.message },
        { role: 'assistant', content: DECLINE_FORBIDDEN },
      ]);
      await extractSafely(tenantId, viewer.id, request.message, DECLINE_FORBIDDEN);
      await maybeCompact(tenantId, viewer.id, conversationId);
      // `rows: []` trivially satisfies either arm of the discriminated union below regardless of
      // which tool was denied — the cast just tells TS what the registry already guarantees.
      return {
        reply: DECLINE_FORBIDDEN,
        conversationId,
        toolUsed: matched.name,
        denied: true,
        rows: [],
      } as SmartSearchResponse;
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
      content: `${memoryPreamble}Today's date is ${toIsoDate(new Date())}.\n\nQuestion: ${request.message}\n\nData (JSON):\n${JSON.stringify(narrationFacts)}`,
    },
  ]);

  await logAudit(tenantId, viewer.id, matched.name, false, request.message);
  const conversationId = await conversationService.appendTurn(tenantId, viewer.id, request.conversationId, [
    { role: 'user', content: request.message },
    { role: 'assistant', content: reply },
  ]);
  await extractSafely(tenantId, viewer.id, request.message, reply);
  await maybeCompact(tenantId, viewer.id, conversationId);
  return { reply, conversationId, toolUsed: matched.name, denied: false, rows } as SmartSearchResponse;
}
