import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { DateRangeField } from './DateRangeField';

afterEach(cleanup);

const field: FormField = { key: 'leaveDates', label: 'Leave dates', type: 'daterange', required: true };

test('DateRangeField renders separate labeled start/end inputs, both empty by default', () => {
  render(<DateRangeField field={field} value={undefined} onChange={() => {}} />);
  const start = screen.getByLabelText('Start date') as HTMLInputElement;
  const end = screen.getByLabelText('End date') as HTMLInputElement;
  assert.equal(start.type, 'date');
  assert.equal(end.type, 'date');
  assert.equal(start.value, '');
  assert.equal(end.value, '');
});

test('DateRangeField falls back to an empty range when given a non-object value', () => {
  render(<DateRangeField field={field} value="not-a-range" onChange={() => {}} />);
  assert.equal((screen.getByLabelText('Start date') as HTMLInputElement).value, '');
  assert.equal((screen.getByLabelText('End date') as HTMLInputElement).value, '');
});

test('DateRangeField shows the current start/end values', () => {
  render(<DateRangeField field={field} value={{ start: '2026-07-01', end: '2026-07-05' }} onChange={() => {}} />);
  assert.equal((screen.getByLabelText('Start date') as HTMLInputElement).value, '2026-07-01');
  assert.equal((screen.getByLabelText('End date') as HTMLInputElement).value, '2026-07-05');
});

test('DateRangeField changing the start date preserves the existing end date', () => {
  let lastValue: unknown;
  render(
    <DateRangeField
      field={field}
      value={{ start: '2026-07-01', end: '2026-07-05' }}
      onChange={(v) => (lastValue = v)}
    />,
  );
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-20' } });
  assert.deepEqual(lastValue, { start: '2026-06-20', end: '2026-07-05' });
});

test('DateRangeField changing the end date preserves the existing start date', () => {
  let lastValue: unknown;
  render(
    <DateRangeField
      field={field}
      value={{ start: '2026-07-01', end: '2026-07-05' }}
      onChange={(v) => (lastValue = v)}
    />,
  );
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-07-10' } });
  assert.deepEqual(lastValue, { start: '2026-07-01', end: '2026-07-10' });
});

test('DateRangeField shows a single error message for the whole field, alongside the marked required label', () => {
  render(
    <DateRangeField
      field={field}
      value={undefined}
      onChange={() => {}}
      error="End date must be on or after the start date"
    />,
  );
  assert.ok(screen.getByText('Leave dates *'));
  const errors = screen.getAllByText('End date must be on or after the start date');
  assert.equal(errors.length, 1);
});
