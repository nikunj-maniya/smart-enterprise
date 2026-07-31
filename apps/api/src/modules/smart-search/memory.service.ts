import type { SmartSearchMemoryDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { extractMemories, type LlmChatMessage } from './llm-client.js';

/** Bounds how many facts accumulate per user — same reasoning as `MAX_HISTORY_MESSAGES` in
 *  smart-search.service.ts: a hard cap keeps the retrieval prompt small and the store from
 *  growing unbounded. Once a user is at the cap, extraction is skipped entirely rather than
 *  silently evicting an older fact they may still care about — the user's own delete action
 *  (the privacy-required manage UI) is the only thing that frees up room. */
const MAX_MEMORIES_PER_USER = 50;

function toDto(row: { id: string; content: string; createdAt: Date; updatedAt: Date }): SmartSearchMemoryDto {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every remembered fact for this user, most recently updated first. Tenant+user scoped — never
 *  visible to another user, even within the same tenant (consistent with the tool permission
 *  checks in smart-search.tools.ts). */
export async function listMemories(tenantId: string, userId: string): Promise<SmartSearchMemoryDto[]> {
  const rows = await prisma.smartSearchMemory.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toDto);
}

/** Plain fact strings only, for injecting into a new conversation's prompt context — never the
 *  full DTO (id/timestamps are UI-only concerns the model has no use for). */
export async function getMemoryContextForUser(tenantId: string, userId: string): Promise<string[]> {
  const rows = await prisma.smartSearchMemory.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
    select: { content: true },
  });
  return rows.map((r) => r.content);
}

async function assertOwnedMemory(
  tenantId: string,
  userId: string,
  id: string,
): Promise<{ id: string; tenantId: string; userId: string }> {
  const existing = await prisma.smartSearchMemory.findUnique({ where: { id } });
  // 404, not 403: a memory that exists but belongs to someone else should look identical to one
  // that doesn't exist at all, same reasoning as requests.service.ts's own visibility checks.
  if (!existing || existing.tenantId !== tenantId || existing.userId !== userId) {
    throw new HttpError(404, 'Memory not found');
  }
  return existing;
}

/** Edits a remembered fact's text in place (privacy requirement: users can correct what's been
 *  remembered about them, not just delete it). */
export async function updateMemory(
  tenantId: string,
  userId: string,
  id: string,
  content: string,
): Promise<SmartSearchMemoryDto> {
  await assertOwnedMemory(tenantId, userId, id);
  const updated = await prisma.smartSearchMemory.update({ where: { id }, data: { content } });
  return toDto(updated);
}

export async function deleteMemory(tenantId: string, userId: string, id: string): Promise<void> {
  await assertOwnedMemory(tenantId, userId, id);
  await prisma.smartSearchMemory.delete({ where: { id } });
}

/**
 * Runs one extraction pass over a conversation snippet and persists any genuinely new facts it
 * surfaces. Deduped against what's already stored (case-insensitive exact match) — the extraction
 * prompt itself is also told what's already remembered so it shouldn't resurface a duplicate; this
 * is a second, cheap safety net over that, not a replacement for it.
 *
 * Callers decide *when* to invoke this (e.g. once at the end of a turn) — this function only
 * knows how to run a single extraction pass and store its result. Every call is an additional
 * local LLM round-trip on top of tool-selection/narration; on this project's dev hardware
 * (12 cores/23GB RAM, prior OOM history under parallel load), callers should invoke this at a low
 * frequency (end-of-turn, never fanned out concurrently with other LLM calls for the same
 * request) rather than on every message.
 */
export async function extractAndStoreMemories(
  tenantId: string,
  userId: string,
  turns: LlmChatMessage[],
): Promise<SmartSearchMemoryDto[]> {
  const existing = await listMemories(tenantId, userId);
  if (existing.length >= MAX_MEMORIES_PER_USER) return [];

  const proposed = await extractMemories(
    turns,
    existing.map((m) => m.content),
  );
  if (proposed.length === 0) return [];

  const existingLower = new Set(existing.map((m) => m.content.trim().toLowerCase()));
  const room = MAX_MEMORIES_PER_USER - existing.length;
  const seen = new Set<string>();
  const toStore: string[] = [];
  for (const fact of proposed) {
    const key = fact.trim().toLowerCase();
    if (existingLower.has(key) || seen.has(key)) continue;
    seen.add(key);
    toStore.push(fact.trim());
    if (toStore.length === room) break;
  }
  if (toStore.length === 0) return [];

  const created = await prisma.$transaction(
    toStore.map((content) => prisma.smartSearchMemory.create({ data: { tenantId, userId, content } })),
  );
  return created.map(toDto);
}
