import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { chunkText, ingestDocument, searchDocuments } from './document-search.service.js';

/**
 * `embed()` (llm-client.ts) is exercised via `globalThis.fetch`, same stubbing approach as
 * llm-client.test.ts/smart-search.service.test.ts — there's no live Ollama in this environment.
 * `prisma.$queryRaw`/`$executeRaw` are stubbed the same way every other smart-search test stubs a
 * prisma delegate (Object.defineProperty), since this table has no Prisma model to mock a delegate
 * for (see the migration's own comment on why it's raw-SQL-only).
 */

let embeddingCalls: string[] = [];
const realFetch = globalThis.fetch;

Object.defineProperty(globalThis, 'fetch', {
  value: async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { input: string };
    embeddingCalls.push(body.input);
    return { ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }) };
  },
  configurable: true,
  writable: true,
});

after(() => {
  Object.defineProperty(globalThis, 'fetch', { value: realFetch, configurable: true, writable: true });
});

beforeEach(() => {
  embeddingCalls = [];
});

describe('chunkText', () => {
  it('returns one chunk for content shorter than chunkSize', () => {
    assert.deepEqual(chunkText('short text', 100, 20), ['short text']);
  });

  it('returns an empty array for blank content', () => {
    assert.deepEqual(chunkText('   ', 100, 20), []);
  });

  it('splits longer content into overlapping windows covering the whole string', () => {
    const content = 'a'.repeat(250);
    const chunks = chunkText(content, 100, 20);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 100);
    // Last chunk reaches the end of the content — nothing is dropped off the tail.
    assert.equal(chunks[chunks.length - 1].length, 250 - (100 - 20) * 2);
  });
});

describe('ingestDocument', () => {
  let executeRawCalls: unknown[][] = [];

  Object.defineProperty(prisma, '$executeRaw', {
    value: async (_strings: readonly string[], ...values: unknown[]) => {
      executeRawCalls.push(values);
      return 1;
    },
    configurable: true,
  });

  beforeEach(() => {
    executeRawCalls = [];
  });

  it('embeds and inserts one row per chunk, scoped to tenantId', async () => {
    const result = await ingestDocument('t1', { source: 'handbook.pdf', content: 'a'.repeat(1500), allowedRoles: [] });

    assert.equal(result.chunksCreated, 2);
    assert.equal(embeddingCalls.length, 2);
    assert.equal(executeRawCalls.length, 2);
    assert.equal(executeRawCalls[0][0], 't1'); // tenantId
    assert.equal(executeRawCalls[0][1], 'handbook.pdf'); // source
  });

  it('stores allowedRoles as a Postgres text[] literal', async () => {
    await ingestDocument('t1', { source: 's.pdf', content: 'short', allowedRoles: ['HrHead', 'EnterpriseAdmin'] });

    assert.equal(executeRawCalls[0][4], '{"HrHead","EnterpriseAdmin"}');
  });

  it('returns zero chunks for blank content without embedding or inserting anything', async () => {
    const result = await ingestDocument('t1', { source: 's.pdf', content: '   ', allowedRoles: [] });

    assert.equal(result.chunksCreated, 0);
    assert.equal(embeddingCalls.length, 0);
    assert.equal(executeRawCalls.length, 0);
  });
});

describe('searchDocuments', () => {
  let queryRawCalls: unknown[][] = [];
  let rows: { source: string; content: string }[] = [];

  Object.defineProperty(prisma, '$queryRaw', {
    value: async (_strings: readonly string[], ...values: unknown[]) => {
      queryRawCalls.push(values);
      return rows;
    },
    configurable: true,
  });

  beforeEach(() => {
    queryRawCalls = [];
    rows = [];
  });

  it('embeds the query and filters by tenantId + the given roles, in SQL', async () => {
    rows = [{ source: 'handbook.pdf', content: 'Matching passage.' }];

    const result = await searchDocuments('t1', ['Employee'], 'what is the leave policy');

    assert.deepEqual(result, rows);
    assert.equal(embeddingCalls[0], 'what is the leave policy');
    assert.equal(queryRawCalls[0][0], 't1'); // tenantId
    assert.equal(queryRawCalls[0][1], '{"Employee"}'); // viewerRoles, as a text[] literal
    assert.equal(queryRawCalls[0][3], 5); // default top-k
  });

  it('passes a custom k through to the LIMIT parameter', async () => {
    await searchDocuments('t1', [], 'query', 2);
    assert.equal(queryRawCalls[0][3], 2);
  });
});
