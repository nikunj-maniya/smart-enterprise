import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  directoryProjectsQuerySchema,
  directoryProjectsResponseSchema,
  directoryUsersQuerySchema,
  directoryUsersResponseSchema,
} from './directory.js';

describe('directoryUsersQuerySchema — csvParam (roles/departments)', () => {
  it('splits a single comma-separated value into an array', () => {
    const parsed = directoryUsersQuerySchema.parse({ roles: 'hr-head,tech-lead' });
    assert.deepEqual(parsed.roles, ['hr-head', 'tech-lead']);
  });

  it('flattens a repeated query key (array of strings) that also contain commas', () => {
    const parsed = directoryUsersQuerySchema.parse({ roles: ['hr-head', 'tech-lead,employee'] });
    assert.deepEqual(parsed.roles, ['hr-head', 'tech-lead', 'employee']);
  });

  it('drops empty segments from trailing/duplicate commas', () => {
    const parsed = directoryUsersQuerySchema.parse({ departments: 'd1,,d2,' });
    assert.deepEqual(parsed.departments, ['d1', 'd2']);
  });

  it('leaves roles/departments undefined when omitted entirely', () => {
    const parsed = directoryUsersQuerySchema.parse({});
    assert.equal(parsed.roles, undefined);
    assert.equal(parsed.departments, undefined);
  });

  it('leaves roles undefined when every segment is empty', () => {
    const parsed = directoryUsersQuerySchema.parse({ roles: ',,' });
    assert.equal(parsed.roles, undefined);
  });
});

describe('directoryUsersQuerySchema — limit', () => {
  it('defaults to 20 when omitted', () => {
    assert.equal(directoryUsersQuerySchema.parse({}).limit, 20);
  });

  it('coerces a numeric string', () => {
    assert.equal(directoryUsersQuerySchema.parse({ limit: '35' }).limit, 35);
  });

  it('rejects a limit below 1 or above 50', () => {
    assert.throws(() => directoryUsersQuerySchema.parse({ limit: '0' }));
    assert.throws(() => directoryUsersQuerySchema.parse({ limit: '51' }));
  });
});

describe('directoryProjectsQuerySchema', () => {
  it('defaults limit to 20 and accepts an optional search term', () => {
    const parsed = directoryProjectsQuerySchema.parse({ search: 'Apollo' });
    assert.equal(parsed.limit, 20);
    assert.equal(parsed.search, 'Apollo');
  });

  it('rejects a limit below 1 or above 50', () => {
    assert.throws(() => directoryProjectsQuerySchema.parse({ limit: '0' }));
    assert.throws(() => directoryProjectsQuerySchema.parse({ limit: '51' }));
  });
});

describe('directoryUsersResponseSchema / directoryProjectsResponseSchema', () => {
  it('accepts a well-formed users response', () => {
    assert.doesNotThrow(() =>
      directoryUsersResponseSchema.parse({ rows: [{ id: 'u1', name: 'Asha', email: 'a@b.c' }] }),
    );
  });

  it('rejects a user row missing a required field', () => {
    assert.throws(() => directoryUsersResponseSchema.parse({ rows: [{ id: 'u1', name: 'Asha' }] }));
  });

  it('accepts a well-formed projects response', () => {
    assert.doesNotThrow(() => directoryProjectsResponseSchema.parse({ rows: [{ id: 'p1', name: 'Apollo' }] }));
  });
});
