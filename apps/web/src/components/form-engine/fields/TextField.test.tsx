import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { TextField } from './TextField';

afterEach(cleanup);

const field: FormField = { key: 'reason', label: 'Reason', type: 'text', required: true };

test('TextField renders the label and marks it required', () => {
  render(<TextField field={field} value="" onChange={() => {}} />);
  const label = screen.getByText('Reason *');
  assert.ok(label);
});

test('TextField renders without the required marker when not required', () => {
  render(<TextField field={{ ...field, required: false }} value="" onChange={() => {}} />);
  assert.equal(screen.queryByText('Reason *'), null);
  assert.ok(screen.getByText('Reason'));
});

test('TextField shows the current value and calls onChange as the user types', () => {
  let lastValue: unknown;
  render(<TextField field={field} value="hello" onChange={(v) => (lastValue = v)} />);
  const input = screen.getByDisplayValue('hello') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'hello world' } });
  assert.equal(lastValue, 'hello world');
});

test('TextField renders the error message instead of help text when both are present', () => {
  render(
    <TextField
      field={{ ...field, helpText: 'Keep it brief' }}
      value=""
      onChange={() => {}}
      error="Reason is required"
    />,
  );
  assert.ok(screen.getByText('Reason is required'));
  assert.equal(screen.queryByText('Keep it brief'), null);
});
