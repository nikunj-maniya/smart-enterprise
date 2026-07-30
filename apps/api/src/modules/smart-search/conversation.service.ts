import type {
  SmartSearchConversationDetail,
  SmartSearchConversationsQuery,
  SmartSearchConversationsResponse,
  SmartSearchConversationSummaryDto,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** Shown for a thread that has no title yet (an empty, just-created conversation, or one whose
 *  first turn hasn't been persisted). Never stored — derived at read time. */
const UNTITLED = 'New conversation';

/** Threads are titled from their first user message, truncated so the history list stays scannable. */
const TITLE_MAX_LENGTH = 80;

function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim();
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed;
}

type ConversationRow = {
  id: string;
  title: string | null;
  summary: string | null;
  summarizedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSummaryDto(row: Pick<ConversationRow, 'id' | 'title' | 'createdAt' | 'updatedAt'>): SmartSearchConversationSummaryDto {
  return {
    id: row.id,
    title: row.title ?? UNTITLED,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every query here filters on both `tenantId` and `userId` — threads are private to the user who
 *  owns them, never visible to other users even within the same tenant (see schema.prisma). */
async function findOwnedConversation(tenantId: string, userId: string, id: string): Promise<ConversationRow> {
  const conversation = await prisma.smartSearchConversation.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      title: true,
      summary: true,
      summarizedUntil: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!conversation || conversation.tenantId !== tenantId || conversation.userId !== userId) {
    throw new HttpError(404, 'Conversation not found');
  }
  return conversation;
}

export async function listConversations(
  tenantId: string,
  userId: string,
  query: SmartSearchConversationsQuery,
): Promise<SmartSearchConversationsResponse> {
  const { page, pageSize } = query;
  const where = { tenantId, userId };

  const [rows, total] = await Promise.all([
    prisma.smartSearchConversation.findMany({
      where,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.smartSearchConversation.count({ where }),
  ]);

  return { rows: rows.map(toSummaryDto), total, page, pageSize };
}

export async function getConversation(
  tenantId: string,
  userId: string,
  id: string,
): Promise<SmartSearchConversationDetail> {
  const conversation = await findOwnedConversation(tenantId, userId, id);
  const messages = await prisma.smartSearchMessage.findMany({
    where: { conversationId: id },
    select: { id: true, role: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return {
    id: conversation.id,
    title: conversation.title ?? UNTITLED,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Creates a new, empty thread — used to pre-allocate a conversation id before the first message
 *  is sent, or to explicitly start a "New chat". Its title is untitled until a first turn lands. */
export async function createConversation(tenantId: string, userId: string): Promise<SmartSearchConversationDetail> {
  const conversation = await prisma.smartSearchConversation.create({
    data: { tenantId, userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return {
    id: conversation.id,
    title: conversation.title ?? UNTITLED,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: [],
  };
}

/** Deletes a thread and its messages. Messages carry a `RESTRICT` FK to their conversation (no
 *  `onDelete: Cascade` in schema.prisma), so they're deleted first, in the same transaction. */
export async function deleteConversation(tenantId: string, userId: string, id: string): Promise<void> {
  await findOwnedConversation(tenantId, userId, id);

  await prisma.$transaction(async (tx) => {
    await tx.smartSearchMessage.deleteMany({ where: { conversationId: id } });
    await tx.smartSearchConversation.delete({ where: { id } });
  });
}

/**
 * Persists one turn's messages (the user's question and, once narrated, the assistant's reply) —
 * the write side of "persistent chat history". Creates a new thread when `conversationId` is
 * omitted (the client's first message in a fresh thread); otherwise appends to an existing,
 * ownership-checked thread. Sets the thread's title from the first user message the first time
 * one is persisted, and bumps `updatedAt` so the history list re-sorts to the top.
 *
 * Intended for the smart-search orchestration (`smart-search.service.ts`) to call once a turn is
 * complete — not exposed as its own HTTP route, since `POST /smart-search` already is that route.
 */
export async function appendTurn(
  tenantId: string,
  userId: string,
  conversationId: string | undefined,
  turns: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const conversation = conversationId
    ? await findOwnedConversation(tenantId, userId, conversationId)
    : await prisma.smartSearchConversation.create({
        data: { tenantId, userId },
        select: { id: true, tenantId: true, userId: true, title: true, createdAt: true, updatedAt: true },
      });

  await prisma.$transaction(async (tx) => {
    // Postgres freezes CURRENT_TIMESTAMP for the lifetime of a transaction, so a plain
    // `@default(now())` would give every row in this createMany an identical createdAt — and since
    // getConversation/getConversationForOrchestration order by createdAt asc with no secondary
    // tiebreaker, a tie leaves the user/assistant order within this turn undefined on read-back.
    // Stamping strictly increasing timestamps here (1ms apart, in turns order) keeps that ordering
    // deterministic without needing a schema change.
    const base = Date.now();
    await tx.smartSearchMessage.createMany({
      data: turns.map((t, i) => ({
        conversationId: conversation.id,
        role: t.role,
        content: t.content,
        createdAt: new Date(base + i),
      })),
    });
    if (!conversation.title) {
      const firstUserTurn = turns.find((t) => t.role === 'user');
      if (firstUserTurn) {
        await tx.smartSearchConversation.update({
          where: { id: conversation.id },
          data: { title: deriveTitle(firstUserTurn.content), updatedAt: new Date() },
        });
        return;
      }
    }
    await tx.smartSearchConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  });

  return conversation.id;
}

/** One raw persisted turn, as needed by the orchestrator to rebuild model context — distinct from
 *  `SmartSearchConversationMessageDto` (no `id`, `createdAt` stays a `Date` rather than an ISO
 *  string) since this never crosses the HTTP boundary. */
export type SmartSearchOrchestrationMessage = { role: 'user' | 'assistant'; content: string; createdAt: Date };

export interface ConversationOrchestrationContext {
  summary: string | null;
  summarizedUntil: Date | null;
  messages: SmartSearchOrchestrationMessage[];
}

/**
 * Raw (non-DTO) thread context for the smart-search orchestrator, not the HTTP-facing detail view:
 * the rolling summary plus only whichever raw messages come after `summarizedUntil` (or every
 * message, if nothing has been folded into a summary yet) — mirrors the context-management scheme
 * described on `SmartSearchConversation` in schema.prisma, so a long thread's summarized prefix is
 * never re-fetched or re-sent to the model. Ownership-checked the same as every other read here.
 */
export async function getConversationForOrchestration(
  tenantId: string,
  userId: string,
  id: string,
): Promise<ConversationOrchestrationContext> {
  const conversation = await findOwnedConversation(tenantId, userId, id);
  const messages = await prisma.smartSearchMessage.findMany({
    where: {
      conversationId: id,
      ...(conversation.summarizedUntil ? { createdAt: { gt: conversation.summarizedUntil } } : {}),
    },
    select: { role: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return {
    summary: conversation.summary,
    summarizedUntil: conversation.summarizedUntil,
    messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, createdAt: m.createdAt })),
  };
}

/**
 * Persists a rolled-up summary of a thread's older messages and advances `summarizedUntil` past
 * them — the write side of context compaction. Called by the orchestrator once a thread's
 * unsummarized tail grows past its threshold (see smart-search.service.ts); ownership-checked like
 * every other write here even though the caller has always just loaded the same thread itself.
 */
export async function compactConversation(
  tenantId: string,
  userId: string,
  id: string,
  summary: string,
  summarizedUntil: Date,
): Promise<void> {
  await findOwnedConversation(tenantId, userId, id);
  await prisma.smartSearchConversation.update({ where: { id }, data: { summary, summarizedUntil } });
}
