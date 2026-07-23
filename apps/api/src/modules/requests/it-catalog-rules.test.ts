import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { assertItemsInActiveCatalog } from './it-catalog-rules.js';

let activeNames: { software: string[]; hardware: string[] };
let findManyArgs: unknown[];

Object.defineProperty(prisma, 'itemCatalog', {
  value: {
    findMany: async (args: { where: { type: 'software' | 'hardware'; name: { in: string[] } } }) => {
      findManyArgs.push(args);
      return activeNames[args.where.type].filter((n) => args.where.name.in.includes(n)).map((name) => ({ name }));
    },
  },
  configurable: true,
});

beforeEach(() => {
  activeNames = { software: [], hardware: [] };
  findManyArgs = [];
});

test('assertItemsInActiveCatalog is a no-op for a non-IT form, never touching the catalog', async () => {
  await assertItemsInActiveCatalog('t1', 'wfh', { software_items: ['Ghost App'] });
  assert.equal(findManyArgs.length, 0);
});

test('assertItemsInActiveCatalog skips a branch with no items submitted at all', async () => {
  await assertItemsInActiveCatalog('t1', 'it', {});
  assert.equal(findManyArgs.length, 0);
});

test('assertItemsInActiveCatalog skips a branch whose value is an empty array', async () => {
  await assertItemsInActiveCatalog('t1', 'it', { software_items: [], hardware_items: [] });
  assert.equal(findManyArgs.length, 0);
});

test('assertItemsInActiveCatalog skips a branch whose value is not an array', async () => {
  await assertItemsInActiveCatalog('t1', 'it', { software_items: 'Slack' });
  assert.equal(findManyArgs.length, 0);
});

test('assertItemsInActiveCatalog passes when every submitted item is an active catalog entry', async () => {
  activeNames.software = ['Slack', 'Figma'];
  await assertItemsInActiveCatalog('t1', 'it', { software_items: ['Slack', 'Figma'] });
  assert.deepEqual(findManyArgs, [
    { where: { tenantId: 't1', type: 'software', name: { in: ['Slack', 'Figma'] }, archived: false }, select: { name: true } },
  ]);
});

test('assertItemsInActiveCatalog filters out non-string entries before checking, ignoring them silently', async () => {
  activeNames.software = ['Slack'];
  // A malformed non-string item (e.g. `123`) is dropped by the `filter`, not checked/reported.
  await assertItemsInActiveCatalog('t1', 'it', { software_items: ['Slack', 123 as unknown as string] });
  assert.equal((findManyArgs[0] as { where: { name: { in: string[] } } }).where.name.in.length, 1);
});

test('assertItemsInActiveCatalog throws 400 naming the specific unavailable software items', async () => {
  activeNames.software = ['Slack'];
  await assert.rejects(
    assertItemsInActiveCatalog('t1', 'it', { software_items: ['Slack', 'Discontinued App'] }),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.ok(err.message.includes('Discontinued App'));
      assert.deepEqual((err.details as Record<string, string[]>).software_items, ['Not available: Discontinued App']);
      return true;
    },
  );
});

test('assertItemsInActiveCatalog throws 400 naming unavailable hardware items independently of software', async () => {
  activeNames.hardware = ['Laptop'];
  await assert.rejects(
    assertItemsInActiveCatalog('t1', 'it', { hardware_items: ['Laptop', 'Retired Monitor'] }),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.deepEqual((err.details as Record<string, string[]>).hardware_items, ['Not available: Retired Monitor']);
      return true;
    },
  );
});

test('assertItemsInActiveCatalog checks software before hardware, throwing on the first invalid branch', async () => {
  activeNames = { software: [], hardware: [] };
  await assert.rejects(
    assertItemsInActiveCatalog('t1', 'it', { software_items: ['Bad Software'], hardware_items: ['Bad Hardware'] }),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.ok(err.message.includes('software'));
      assert.equal('hardware_items' in (err.details as Record<string, unknown>), false);
      return true;
    },
  );
  // Only the software branch's query ran before the throw short-circuited the loop.
  assert.equal(findManyArgs.length, 1);
});
