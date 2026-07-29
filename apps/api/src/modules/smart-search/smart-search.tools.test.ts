import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redisConnection } from '../../lib/redis.js';
import { queryAbsencesArgsSchema, resolveDateRange } from './smart-search.tools.js';

// smart-search.tools.js transitively imports the BullMQ `redisConnection` (via queryMyRequests ->
// requests.service.js -> notifications.service.js -> slack-delivery.js), which connects eagerly
// and retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately (requests.service.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * `resolveDateRange` is the one place the tool resolves a relative range word to concrete dates
 * using the server's clock — the model is never asked to compute or state a date itself (see
 * smart-search.tools.ts). A fixed Wednesday is used as "now" so week-boundary math is unambiguous.
 */
const WEDNESDAY = new Date('2026-08-05T10:00:00.000Z'); // 2026-08-05 is a Wednesday

describe('resolveDateRange', () => {
  it('"today" resolves to the current calendar day', () => {
    assert.deepEqual(resolveDateRange('today', undefined, undefined, WEDNESDAY), {
      from: '2026-08-05',
      to: '2026-08-05',
    });
  });

  it('"this_week" resolves to the Monday–Sunday span containing today', () => {
    assert.deepEqual(resolveDateRange('this_week', undefined, undefined, WEDNESDAY), {
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });

  it('"next_week" resolves to the following Monday–Sunday span', () => {
    assert.deepEqual(resolveDateRange('next_week', undefined, undefined, WEDNESDAY), {
      from: '2026-08-10',
      to: '2026-08-16',
    });
  });

  it('"this_month" resolves to the first–last day of the current month', () => {
    assert.deepEqual(resolveDateRange('this_month', undefined, undefined, WEDNESDAY), {
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('"custom" passes the given rangeStart/rangeEnd through untouched', () => {
    assert.deepEqual(resolveDateRange('custom', '2026-01-01', '2026-01-15', WEDNESDAY), {
      from: '2026-01-01',
      to: '2026-01-15',
    });
  });

  it('"this_week" anchors correctly when today is a Sunday (Date#getDay()===0 edge case)', () => {
    const sunday = new Date('2026-08-09T10:00:00.000Z');
    assert.deepEqual(resolveDateRange('this_week', undefined, undefined, sunday), {
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });
});

describe('queryAbsencesArgsSchema', () => {
  it('accepts a non-custom range with no rangeStart/rangeEnd', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'next_week' }).success, true);
  });

  it('rejects "custom" range with rangeStart/rangeEnd missing', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'custom' }).success, false);
  });

  it('accepts "custom" range when both rangeStart and rangeEnd are given', () => {
    const result = queryAbsencesArgsSchema.safeParse({ range: 'custom', rangeStart: '2026-01-01', rangeEnd: '2026-01-02' });
    assert.equal(result.success, true);
  });

  it('rejects an unrecognized range value', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'last_year' }).success, false);
  });
});
