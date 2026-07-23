import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { NumberField } from './NumberField';

afterEach(cleanup);

const field: FormField = { key: 'count', label: 'Count', type: 'number', required: true };

test('NumberField renders the label and marks it required', () => {
  render(<NumberField field={field} value={undefined} onChange={() => {}} />);
  assert.ok(screen.getByText('Count *'));
});

test('NumberField shows the current numeric value', () => {
  render(<NumberField field={field} value={42} onChange={() => {}} />);
  assert.ok(screen.getByDisplayValue('42'));
});

test('NumberField shows an empty input when the value is undefined', () => {
  render(<NumberField field={field} value={undefined} onChange={() => {}} />);
  const input = screen.getByRole('spinbutton') as HTMLInputElement;
  assert.equal(input.value, '');
});

test('NumberField calls onChange with a number as the user types', () => {
  let lastValue: unknown;
  render(<NumberField field={field} value={undefined} onChange={(v) => (lastValue = v)} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
  assert.equal(lastValue, 7);
});

test('NumberField calls onChange with undefined when the input is cleared', () => {
  let lastValue: unknown = 5;
  render(<NumberField field={field} value={5} onChange={(v) => (lastValue = v)} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
  assert.equal(lastValue, undefined);
});

test('NumberField renders the error message instead of help text when both are present', () => {
  render(
    <NumberField
      field={{ ...field, helpText: 'Whole numbers only' }}
      value={undefined}
      onChange={() => {}}
      error="Count is required"
    />,
  );
  assert.ok(screen.getByText('Count is required'));
  assert.equal(screen.queryByText('Whole numbers only'), null);
});

test('NumberField disables the input when disabled', () => {
  render(<NumberField field={field} value={undefined} onChange={() => {}} disabled />);
  const input = screen.getByRole('spinbutton') as HTMLInputElement;
  assert.equal(input.disabled, true);
});
