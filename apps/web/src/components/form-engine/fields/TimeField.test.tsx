import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { TimeField } from './TimeField';

afterEach(cleanup);

const field: FormField = { key: 'startTime', label: 'Start time', type: 'time', required: true };

test('TimeField renders the label and marks it required', () => {
  render(<TimeField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Start time *'));
});

test('TimeField renders without the required marker when not required', () => {
  render(<TimeField field={{ ...field, required: false }} value="" onChange={() => {}} />);
  assert.equal(screen.queryByText('Start time *'), null);
  assert.ok(screen.getByText('Start time'));
});

test('TimeField shows the current value and calls onChange as the user picks a time', () => {
  let lastValue: unknown;
  render(<TimeField field={field} value="09:00" onChange={(v) => (lastValue = v)} />);
  const input = screen.getByDisplayValue('09:00') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '10:30' } });
  assert.equal(lastValue, '10:30');
});

test('TimeField disables the input when disabled', () => {
  render(<TimeField field={field} value="" onChange={() => {}} disabled />);
  const input = document.getElementById('field-startTime') as HTMLInputElement;
  assert.equal(input.disabled, true);
});

test('TimeField renders the error message instead of help text when both are present', () => {
  render(
    <TimeField
      field={{ ...field, helpText: 'Use 24-hour format' }}
      value=""
      onChange={() => {}}
      error="Start time is required"
    />,
  );
  assert.ok(screen.getByText('Start time is required'));
  assert.equal(screen.queryByText('Use 24-hour format'), null);
});
