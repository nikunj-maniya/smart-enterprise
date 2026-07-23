import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { DateTimeField } from './DateTimeField';

afterEach(cleanup);

const field: FormField = { key: 'checkIn', label: 'Check-in time', type: 'datetime', required: true };

test('DateTimeField renders the label and marks it required', () => {
  render(<DateTimeField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Check-in time *'));
});

test('DateTimeField renders without the required marker when not required', () => {
  render(<DateTimeField field={{ ...field, required: false }} value="" onChange={() => {}} />);
  assert.equal(screen.queryByText('Check-in time *'), null);
  assert.ok(screen.getByText('Check-in time'));
});

test('DateTimeField shows the current datetime-local value and calls onChange with the new one', () => {
  let lastValue: unknown;
  render(<DateTimeField field={field} value="2026-07-01T09:30" onChange={(v) => (lastValue = v)} />);
  const input = screen.getByDisplayValue('2026-07-01T09:30') as HTMLInputElement;
  assert.equal(input.type, 'datetime-local');
  fireEvent.change(input, { target: { value: '2026-07-01T17:00' } });
  assert.equal(lastValue, '2026-07-01T17:00');
});

test('DateTimeField falls back to an empty value when given a non-string value', () => {
  render(<DateTimeField field={field} value={null} onChange={() => {}} />);
  const input = screen.getByDisplayValue('') as HTMLInputElement;
  assert.equal(input.type, 'datetime-local');
});

test('DateTimeField renders the error message instead of help text when both are present', () => {
  render(
    <DateTimeField
      field={{ ...field, helpText: 'Use the office clock' }}
      value=""
      onChange={() => {}}
      error="Check-in time is required"
    />,
  );
  assert.ok(screen.getByText('Check-in time is required'));
  assert.equal(screen.queryByText('Use the office clock'), null);
});
