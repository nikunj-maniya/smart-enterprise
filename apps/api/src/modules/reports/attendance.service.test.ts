import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { reportsRouter } from './reports.routes.js';
import { errorHandler } from '../../middleware/error.js';
import { csvCell, halfDayDatesOf } from './attendance.service.js';

describe('csvCell (payroll CSV guard)', () => {
  it('neutralizes formula-prefix cells (Excel injection)', () => {
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvCell('+1234'), "'+1234");
    assert.equal(csvCell('-cmd'), "'-cmd");
    assert.equal(csvCell('@import'), "'@import");
  });

  it('quotes cells containing commas, quotes, or newlines per RFC 4180', () => {
    assert.equal(csvCell('Doe, Jane'), '"Doe, Jane"');
    assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
    assert.equal(csvCell('a\nb'), '"a\nb"');
  });

  it('quotes a guarded cell that also contains a comma', () => {
    assert.equal(csvCell('=HYPERLINK(x),y'), '"\'=HYPERLINK(x),y"');
  });

  it('passes plain values through unchanged', () => {
    assert.equal(csvCell('Asha Patel'), 'Asha Patel');
    assert.equal(csvCell('21'), '21');
    assert.equal(csvCell(''), '');
  });
});

describe('halfDayDatesOf (payload extraction)', () => {
  it('reads half_day_dates for leave and half_wfh_dates for wfh', () => {
    assert.deepEqual(halfDayDatesOf({ half_day_dates: ['2026-06-02'] }, 'leave'), ['2026-06-02']);
    assert.deepEqual(halfDayDatesOf({ half_wfh_dates: ['2026-06-03'] }, 'wfh'), ['2026-06-03']);
  });

  it('does not cross-read the other form\'s key', () => {
    assert.deepEqual(halfDayDatesOf({ half_wfh_dates: ['2026-06-03'] }, 'leave'), []);
  });

  it('normalizes datetime strings to calendar days and drops non-strings', () => {
    assert.deepEqual(
      halfDayDatesOf({ half_day_dates: ['2026-06-02T00:00:00.000Z', 42, null] }, 'leave'),
      ['2026-06-02'],
    );
  });

  it('tolerates malformed payloads (null, non-array, missing key)', () => {
    assert.deepEqual(halfDayDatesOf(null, 'leave'), []);
    assert.deepEqual(halfDayDatesOf({ half_day_dates: 'not-an-array' }, 'leave'), []);
    assert.deepEqual(halfDayDatesOf({}, 'wfh'), []);
  });
});

describe('attendance report routes (pre-DB behavior)', () => {
  function buildApp() {
    const app = express();
    app.use('/reports', reportsRouter);
    app.use(errorHandler);
    return app;
  }

  it('rejects unauthenticated report and export requests (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/reports/attendance?month=2026-06')).status, 401);
    assert.equal((await request(app).get('/reports/attendance/export?month=2026-06')).status, 401);
  });
});
