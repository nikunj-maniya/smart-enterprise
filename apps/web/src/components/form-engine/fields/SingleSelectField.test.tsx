import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { SingleSelectField } from './SingleSelectField';

afterEach(cleanup);

const field: FormField = {
  key: 'department',
  label: 'Department',
  type: 'single-select',
  required: true,
  options: [
    { value: 'eng', label: 'Engineering' },
    { value: 'fin', label: 'Finance' },
  ],
};

test('SingleSelectField renders the label and every option', () => {
  render(<SingleSelectField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Department *'));
  assert.ok(screen.getByRole('option', { name: 'Engineering' }));
  assert.ok(screen.getByRole('option', { name: 'Finance' }));
});

test('SingleSelectField shows the chosen option as selected', () => {
  render(<SingleSelectField field={field} value="fin" onChange={() => {}} />);
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  assert.equal(select.value, 'fin');
});

test('SingleSelectField calls onChange with the newly picked value', () => {
  let lastValue: unknown;
  render(<SingleSelectField field={field} value="" onChange={(v) => (lastValue = v)} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'eng' } });
  assert.equal(lastValue, 'eng');
});

test('SingleSelectField disables the select when disabled', () => {
  render(<SingleSelectField field={field} value="" onChange={() => {}} disabled />);
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  assert.equal(select.disabled, true);
});

test('SingleSelectField renders the error message instead of help text when both are present', () => {
  render(
    <SingleSelectField
      field={{ ...field, helpText: 'Pick your department' }}
      value=""
      onChange={() => {}}
      error="Department is required"
    />,
  );
  assert.ok(screen.getByText('Department is required'));
  assert.equal(screen.queryByText('Pick your department'), null);
});
