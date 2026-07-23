import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { DateField } from './DateField';

afterEach(cleanup);

const field: FormField = { key: 'startDate', label: 'Start date', type: 'date', required: true };

test('DateField renders the label and marks it required', () => {
  render(<DateField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Start date *'));
});

test('DateField renders without the required marker when not required', () => {
  render(<DateField field={{ ...field, required: false }} value="" onChange={() => {}} />);
  assert.equal(screen.queryByText('Start date *'), null);
  assert.ok(screen.getByText('Start date'));
});

test('DateField shows the current ISO date value and calls onChange with the picked date', () => {
  let lastValue: unknown;
  render(<DateField field={field} value="2026-07-01" onChange={(v) => (lastValue = v)} />);
  const input = screen.getByDisplayValue('2026-07-01') as HTMLInputElement;
  assert.equal(input.type, 'date');
  fireEvent.change(input, { target: { value: '2026-07-15' } });
  assert.equal(lastValue, '2026-07-15');
});

test('DateField falls back to an empty value when given a non-string value', () => {
  render(<DateField field={field} value={undefined} onChange={() => {}} />);
  const input = screen.getByDisplayValue('') as HTMLInputElement;
  assert.equal(input.type, 'date');
});

test('DateField renders the error message instead of help text when both are present', () => {
  render(
    <DateField
      field={{ ...field, helpText: 'Pick the first day' }}
      value=""
      onChange={() => {}}
      error="Start date is required"
    />,
  );
  assert.ok(screen.getByText('Start date is required'));
  assert.equal(screen.queryByText('Pick the first day'), null);
});

test('DateField disables the input when disabled', () => {
  render(<DateField field={field} value="" onChange={() => {}} disabled />);
  const input = screen.getByDisplayValue('') as HTMLInputElement;
  assert.equal(input.disabled, true);
});
