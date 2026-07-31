import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import {
  deleteMemory,
  extractAndStoreMemories,
  getMemoryContextForUser,
  listMemories,
  updateMemory,
} from './memory.service.js';

/**
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine the delegates this service reads/writes as stubs backed by the mutable rows below
 * (users.service.test.ts pattern). `$transaction`'s array form just awaits the already-created
 * promises, same as that file's stub.
 *
 * The LLM boundary (llm-client.ts's `extractMemories`) is stubbed at the `fetch` level, same
 * technique smart-search.service.test.ts uses for `selectTool`/`narrate` — the real
 * request-shaping/response-parsing code still runs against a canned `/chat/completions` reply.
 *
 * IMPORTANT — no live Ollama instance exists in this environment: these tests only prove the
 * extraction/storage/dedup/permission-scoping wiring is correct against canned LLM responses. A
 * manual smoke test against a real running Ollama instance is still required to validate real
 * extraction quality end-to-end.
 */

type MemoryRow = { id: string; tenantId: string; userId: string; content: string; createdAt: Date; updatedAt: Date };

let rows: MemoryRow[] = [];
let nextId = 1;

Object.defineProperty(prisma, 'smartSearchMemory', {
  value: {
    findMany: async (args: { where: { tenantId: string; userId: string } }) =>
      rows
        .filter((r) => r.tenantId === args.where.tenantId && r.userId === args.where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    findUnique: async (args: { where: { id: string } }) => rows.find((r) => r.id === args.where.id) ?? null,
    update: async (args: { where: { id: string }; data: { content: string } }) => {
      const row = rows.find((r) => r.id === args.where.id)!;
      row.content = args.data.content;
      row.updatedAt = new Date();
      return row;
    },
    delete: async (args: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== args.where.id);
    },
    create: async (args: { data: { tenantId: string; userId: string; content: string } }) => {
      const row: MemoryRow = { id: `m${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      rows.push(row);
      return row;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)),
  configurable: true,
});

let llmResponses: unknown[] = [];
const llmCalls: Array<{ body: Record<string, unknown> }> = [];
const realFetch = globalThis.fetch;

Object.defineProperty(globalThis, 'fetch', {
  value: async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    llmCalls.push({ body });
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

beforeEach(() => {
  rows = [];
  nextId = 1;
  llmResponses = [];
  llmCalls.length = 0;
});

function memoryRow(overrides: Partial<MemoryRow> & Pick<MemoryRow, 'id'>): MemoryRow {
  return {
    tenantId: 't1',
    userId: 'u1',
    content: 'Prefers async standups',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function extractionResponse(facts: string[]) {
  return { choices: [{ message: { content: JSON.stringify(facts), tool_calls: [] } }] };
}

describe('listMemories / getMemoryContextForUser', () => {
  it('only returns rows scoped to the given tenant and user, most recently updated first', async () => {
    rows = [
      memoryRow({ id: 'm1', updatedAt: new Date('2026-01-01T00:00:00.000Z') }),
      memoryRow({ id: 'm2', updatedAt: new Date('2026-02-01T00:00:00.000Z') }),
      memoryRow({ id: 'm3', tenantId: 't2', updatedAt: new Date('2026-03-01T00:00:00.000Z') }),
      memoryRow({ id: 'm4', userId: 'u2', updatedAt: new Date('2026-03-01T00:00:00.000Z') }),
    ];

    const result = await listMemories('t1', 'u1');

    assert.deepEqual(result.map((r) => r.id), ['m2', 'm1']);
  });

  it('getMemoryContextForUser returns plain fact strings only', async () => {
    rows = [memoryRow({ id: 'm1', content: 'Works East Coast hours' })];

    const context = await getMemoryContextForUser('t1', 'u1');

    assert.deepEqual(context, ['Works East Coast hours']);
  });
});

describe('updateMemory / deleteMemory — tenant+user scoping', () => {
  it('updates a fact owned by the caller', async () => {
    rows = [memoryRow({ id: 'm1', content: 'old fact' })];

    const updated = await updateMemory('t1', 'u1', 'm1', 'new fact');

    assert.equal(updated.content, 'new fact');
  });

  it('rejects updating a memory owned by a different user in the same tenant (404, not leaked)', async () => {
    rows = [memoryRow({ id: 'm1', userId: 'other-user' })];

    await assert.rejects(updateMemory('t1', 'u1', 'm1', 'new fact'), /Memory not found/);
  });

  it('rejects updating a memory from a different tenant', async () => {
    rows = [memoryRow({ id: 'm1', tenantId: 't2' })];

    await assert.rejects(updateMemory('t1', 'u1', 'm1', 'new fact'), /Memory not found/);
  });

  it('rejects deleting a nonexistent memory', async () => {
    await assert.rejects(deleteMemory('t1', 'u1', 'missing'), /Memory not found/);
  });

  it('deletes a fact owned by the caller', async () => {
    rows = [memoryRow({ id: 'm1' })];

    await deleteMemory('t1', 'u1', 'm1');

    assert.deepEqual(rows, []);
  });
});

describe('extractAndStoreMemories', () => {
  it('stores new facts the extraction call proposes', async () => {
    llmResponses = [extractionResponse(['Prefers written updates over calls'])];

    const created = await extractAndStoreMemories('t1', 'u1', [
      { role: 'user', content: 'I always prefer written updates over calls' },
    ]);

    assert.equal(created.length, 1);
    assert.equal(created[0].content, 'Prefers written updates over calls');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tenantId, 't1');
    assert.equal(rows[0].userId, 'u1');
  });

  it('passes existing memories to the extraction call so it can avoid duplicates', async () => {
    rows = [memoryRow({ id: 'm1', content: 'Prefers async standups' })];
    llmResponses = [extractionResponse([])];

    await extractAndStoreMemories('t1', 'u1', [{ role: 'user', content: 'anything' }]);

    const requestBody = llmCalls[0].body as { messages: Array<{ content: string }> };
    assert.match(requestBody.messages[1].content, /Prefers async standups/);
  });

  it('stores nothing when the model proposes no new facts', async () => {
    llmResponses = [extractionResponse([])];

    const created = await extractAndStoreMemories('t1', 'u1', [{ role: 'user', content: 'what time is it' }]);

    assert.deepEqual(created, []);
    assert.equal(rows.length, 0);
  });

  it('dedupes a proposed fact that already exists (case-insensitive)', async () => {
    rows = [memoryRow({ id: 'm1', content: 'Prefers async standups' })];
    llmResponses = [extractionResponse(['prefers async standups', 'Works East Coast hours'])];

    const created = await extractAndStoreMemories('t1', 'u1', [{ role: 'user', content: 'x' }]);

    assert.deepEqual(
      created.map((c) => c.content),
      ['Works East Coast hours'],
    );
    assert.equal(rows.length, 2);
  });

  it('skips extraction entirely once the per-user cap is already reached', async () => {
    rows = Array.from({ length: 50 }, (_, i) => memoryRow({ id: `m${i}`, content: `fact ${i}` }));

    const created = await extractAndStoreMemories('t1', 'u1', [{ role: 'user', content: 'x' }]);

    assert.deepEqual(created, []);
    assert.equal(llmCalls.length, 0); // no LLM call spent once already at the cap
    assert.equal(rows.length, 50);
  });

  it('caps how many new facts are stored to whatever room remains under the limit', async () => {
    rows = Array.from({ length: 49 }, (_, i) => memoryRow({ id: `m${i}`, content: `fact ${i}` }));
    llmResponses = [extractionResponse(['new fact A', 'new fact B', 'new fact C'])];

    const created = await extractAndStoreMemories('t1', 'u1', [{ role: 'user', content: 'x' }]);

    assert.equal(created.length, 1); // only 1 slot of room left (49 existing, cap 50)
    assert.equal(rows.length, 50);
  });
});
