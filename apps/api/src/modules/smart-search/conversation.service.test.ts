import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import {
  appendTurn,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from './conversation.service.js';

/**
 * Stubbed-Prisma suite (departments.service.test.ts pattern): every delegate this service reads
 * or writes is redefined as an in-memory stub, reset in `beforeEach`. `prisma.$transaction` just
 * invokes its callback against the same stubs.
 */

type ConversationRow = {
  id: string;
  tenantId: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = { id: string; conversationId: string; role: string; content: string; createdAt: Date };

function conversationRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'c1',
    tenantId: 't1',
    userId: 'u1',
    title: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

let conversationRows: ConversationRow[] = [];
let conversationTotal = 0;
let existingConversation: ConversationRow | null = null;
let createResult: ConversationRow = conversationRow();
let messageRows: MessageRow[] = [];

const calls = {
  conversationFindMany: [] as unknown[],
  conversationCount: [] as unknown[],
  conversationFindUnique: [] as unknown[],
  conversationCreate: [] as unknown[],
  messageFindMany: [] as unknown[],
  transactions: 0,
  txMessageCreateMany: [] as unknown[],
  txMessageDeleteMany: [] as unknown[],
  txConversationUpdate: [] as unknown[],
  txConversationDelete: [] as unknown[],
};

const txStub = {
  smartSearchMessage: {
    createMany: async (args: unknown) => {
      calls.txMessageCreateMany.push(args);
    },
    deleteMany: async (args: unknown) => {
      calls.txMessageDeleteMany.push(args);
    },
  },
  smartSearchConversation: {
    update: async (args: unknown) => {
      calls.txConversationUpdate.push(args);
    },
    delete: async (args: unknown) => {
      calls.txConversationDelete.push(args);
    },
  },
};

Object.defineProperty(prisma, 'smartSearchConversation', {
  value: {
    findMany: async (args: unknown) => {
      calls.conversationFindMany.push(args);
      return conversationRows;
    },
    count: async (args: unknown) => {
      calls.conversationCount.push(args);
      return conversationTotal;
    },
    findUnique: async (args: unknown) => {
      calls.conversationFindUnique.push(args);
      return existingConversation;
    },
    create: async (args: unknown) => {
      calls.conversationCreate.push(args);
      return createResult;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'smartSearchMessage', {
  value: {
    findMany: async (args: unknown) => {
      calls.messageFindMany.push(args);
      return messageRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: typeof txStub) => Promise<unknown>) => {
    calls.transactions += 1;
    return fn(txStub);
  },
  configurable: true,
});

beforeEach(() => {
  conversationRows = [];
  conversationTotal = 0;
  existingConversation = null;
  createResult = conversationRow();
  messageRows = [];
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('listConversations', () => {
  it('scopes to tenant + user, orders by updatedAt desc, and paginates', async () => {
    conversationRows = [conversationRow({ id: 'c1', title: 'Hello there' })];
    conversationTotal = 1;

    const res = await listConversations('t1', 'u1', { page: 2, pageSize: 10 });

    assert.deepEqual(calls.conversationFindMany[0], {
      where: { tenantId: 't1', userId: 'u1' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: 10,
      take: 10,
    });
    assert.deepEqual(calls.conversationCount[0], { where: { tenantId: 't1', userId: 'u1' } });
    assert.equal(res.total, 1);
    assert.equal(res.page, 2);
    assert.equal(res.rows[0].title, 'Hello there');
  });

  it('falls back to a placeholder title for an untitled (empty) thread', async () => {
    conversationRows = [conversationRow({ id: 'c1', title: null })];
    conversationTotal = 1;

    const res = await listConversations('t1', 'u1', { page: 1, pageSize: 20 });

    assert.equal(res.rows[0].title, 'New conversation');
  });
});

describe('getConversation', () => {
  it('returns thread detail with messages oldest-first, scoped to the owning tenant + user', async () => {
    existingConversation = conversationRow({ id: 'c1', title: 'Hi' });
    messageRows = [
      { id: 'm2', conversationId: 'c1', role: 'assistant', content: 'Hello!', createdAt: new Date('2026-07-01T00:01:00.000Z') },
      { id: 'm1', conversationId: 'c1', role: 'user', content: 'Hi', createdAt: new Date('2026-07-01T00:00:00.000Z') },
    ];

    const detail = await getConversation('t1', 'u1', 'c1');

    assert.equal(detail.id, 'c1');
    assert.equal(detail.title, 'Hi');
    assert.deepEqual(calls.messageFindMany[0], {
      where: { conversationId: 'c1' },
      select: { id: true, role: true, content: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(detail.messages.length, 2);
  });

  it('throws HttpError(404) when no such thread exists', async () => {
    existingConversation = null;
    await assert.rejects(
      () => getConversation('t1', 'u1', 'missing'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it("throws HttpError(404) for another tenant's thread, never leaking it", async () => {
    existingConversation = conversationRow({ id: 'c1', tenantId: 'other-tenant' });
    await assert.rejects(
      () => getConversation('t1', 'u1', 'c1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it("throws HttpError(404) for another user's thread in the same tenant, never leaking it", async () => {
    existingConversation = conversationRow({ id: 'c1', userId: 'other-user' });
    await assert.rejects(
      () => getConversation('t1', 'u1', 'c1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });
});

describe('createConversation', () => {
  it('creates an empty, untitled thread scoped to the caller', async () => {
    createResult = conversationRow({ id: 'new-c', title: null });

    const detail = await createConversation('t1', 'u1');

    assert.deepEqual(calls.conversationCreate[0], {
      data: { tenantId: 't1', userId: 'u1' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    assert.equal(detail.id, 'new-c');
    assert.equal(detail.title, 'New conversation');
    assert.deepEqual(detail.messages, []);
  });
});

describe('deleteConversation', () => {
  it('deletes messages before the conversation, in one transaction', async () => {
    existingConversation = conversationRow({ id: 'c1' });

    await deleteConversation('t1', 'u1', 'c1');

    assert.equal(calls.transactions, 1);
    assert.deepEqual(calls.txMessageDeleteMany[0], { where: { conversationId: 'c1' } });
    assert.deepEqual(calls.txConversationDelete[0], { where: { id: 'c1' } });
  });

  it('throws HttpError(404) instead of deleting when the thread is not owned by this tenant/user', async () => {
    existingConversation = conversationRow({ id: 'c1', userId: 'other-user' });

    await assert.rejects(
      () => deleteConversation('t1', 'u1', 'c1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
    assert.equal(calls.transactions, 0);
  });
});

describe('appendTurn', () => {
  it('creates a new thread when no conversationId is given, and titles it from the first user turn', async () => {
    createResult = conversationRow({ id: 'new-c', title: null });

    const id = await appendTurn('t1', 'u1', undefined, [
      { role: 'user', content: 'What is my leave balance?' },
      { role: 'assistant', content: 'You have 12 days left.' },
    ]);

    assert.equal(id, 'new-c');
    assert.deepEqual(calls.conversationCreate[0], {
      data: { tenantId: 't1', userId: 'u1' },
      select: { id: true, tenantId: true, userId: true, title: true, createdAt: true, updatedAt: true },
    });
    assert.equal(calls.txMessageCreateMany[0] && (calls.txMessageCreateMany[0] as { data: unknown[] }).data.length, 2);
    assert.deepEqual((calls.txConversationUpdate[0] as { data: { title?: string } }).data.title, 'What is my leave balance?');
  });

  it('appends to an existing thread without touching its already-set title', async () => {
    existingConversation = conversationRow({ id: 'c1', title: 'Existing title' });

    await appendTurn('t1', 'u1', 'c1', [
      { role: 'user', content: 'Follow-up question' },
      { role: 'assistant', content: 'Follow-up answer' },
    ]);

    const updateArgs = calls.txConversationUpdate[0] as { data: { title?: string; updatedAt: Date } };
    assert.equal(updateArgs.data.title, undefined);
    assert.ok(updateArgs.data.updatedAt instanceof Date);
  });

  it("throws HttpError(404) rather than appending to another user's thread", async () => {
    existingConversation = conversationRow({ id: 'c1', userId: 'other-user' });

    await assert.rejects(
      () => appendTurn('t1', 'u1', 'c1', [{ role: 'user', content: 'hi' }]),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('stamps each message in a turn with a strictly increasing createdAt, so ordering never ties', async () => {
    createResult = conversationRow({ id: 'new-c', title: null });

    await appendTurn('t1', 'u1', undefined, [
      { role: 'user', content: 'What is my leave balance?' },
      { role: 'assistant', content: 'You have 12 days left.' },
    ]);

    const rows = (calls.txMessageCreateMany[0] as { data: { role: string; createdAt: Date }[] }).data;
    assert.equal(rows[0].role, 'user');
    assert.equal(rows[1].role, 'assistant');
    assert.ok(rows[1].createdAt.getTime() > rows[0].createdAt.getTime());
  });

  it('truncates an overlong first message to a bounded title', async () => {
    createResult = conversationRow({ id: 'new-c', title: null });
    const longMessage = 'x'.repeat(200);

    await appendTurn('t1', 'u1', undefined, [{ role: 'user', content: longMessage }]);

    const title = (calls.txConversationUpdate[0] as { data: { title: string } }).data.title;
    assert.equal(title.length, 81); // 80 chars + ellipsis
    assert.ok(title.endsWith('…'));
  });
});
