import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'minio';
import { getSignedDownloadUrl, uploadObject } from './object-storage.js';

/**
 * object-storage.ts keeps its `minio.Client` instance module-private, so the only interception
 * point is the shared `Client.prototype` — every minio method lives there (verified: instances
 * carry no own properties for these), so overriding the prototype affects the module's internal
 * client exactly like stubbing a Prisma delegate affects `prisma`.
 */
let calls: { bucketExists: unknown[]; makeBucket: unknown[]; putObject: unknown[]; presignedGetObject: unknown[] };
let bucketExists: boolean;

Object.defineProperty(Client.prototype, 'bucketExists', {
  value: async function (bucket: string) {
    calls.bucketExists.push(bucket);
    return bucketExists;
  },
  configurable: true,
});
Object.defineProperty(Client.prototype, 'makeBucket', {
  value: async function (bucket: string) {
    calls.makeBucket.push(bucket);
  },
  configurable: true,
});
Object.defineProperty(Client.prototype, 'putObject', {
  value: async function (...args: unknown[]) {
    calls.putObject.push(args);
  },
  configurable: true,
});
Object.defineProperty(Client.prototype, 'presignedGetObject', {
  value: async function (...args: unknown[]) {
    calls.presignedGetObject.push(args);
    return 'https://signed.example/object';
  },
  configurable: true,
});

beforeEach(() => {
  calls = { bucketExists: [], makeBucket: [], putObject: [], presignedGetObject: [] };
  bucketExists = true;
});

// object-storage.ts memoizes bucket-creation in a module-level `bucketReady` promise that is set
// on the very first call across the whole process, so only ONE test in this file can observe a
// real (non-memoized) `ensureBucket()` run. This test goes first and deliberately makes
// `bucketExists` throw, proving the `.catch(() => false)` fallback still creates the bucket —
// the strictly stronger case (a plain `false` return follows the same "not exists" branch).
test('a failing bucketExists check (treated as "does not exist") still creates the bucket, once', async () => {
  Object.defineProperty(Client.prototype, 'bucketExists', {
    value: async function (bucket: string) {
      calls.bucketExists.push(bucket);
      throw new Error('network error');
    },
    configurable: true,
  });
  await uploadObject('key-5', Buffer.from('x'), 'text/plain');
  assert.equal(calls.bucketExists.length, 1);
  assert.equal(calls.makeBucket.length, 1);
  assert.equal(calls.putObject.length, 1);
  const [bucket, key, data, size, meta] = calls.putObject[0] as [string, string, Buffer, number, Record<string, string>];
  assert.equal(key, 'key-5');
  assert.deepEqual(data, Buffer.from('x'));
  assert.equal(size, 1);
  assert.deepEqual(meta, { 'Content-Type': 'text/plain' });
  assert.equal(typeof bucket, 'string');
});

test('uploadObject never re-checks or re-creates the bucket on later calls (ensureBucket is memoized)', async () => {
  await uploadObject('key-1', Buffer.from('hello'), 'text/plain');
  assert.equal(calls.bucketExists.length, 0);
  assert.equal(calls.makeBucket.length, 0);
  assert.equal(calls.putObject.length, 1);
});

test('getSignedDownloadUrl returns the presigned URL with the default 300s expiry', async () => {
  const url = await getSignedDownloadUrl('key-3');
  assert.equal(url, 'https://signed.example/object');
  const [, key, expiry] = calls.presignedGetObject[0] as [string, string, number];
  assert.equal(key, 'key-3');
  assert.equal(expiry, 300);
});

test('getSignedDownloadUrl passes through a custom expiry', async () => {
  await getSignedDownloadUrl('key-4', 60);
  const [, , expiry] = calls.presignedGetObject[0] as [string, string, number];
  assert.equal(expiry, 60);
});
