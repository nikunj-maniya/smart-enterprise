import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { CheckboxGroupField } from './CheckboxGroupField';

afterEach(cleanup);

const field: FormField = {
  key: 'perks',
  label: 'Perks',
  type: 'checkbox-group',
  required: true,
  options: [
    { value: 'wifi', label: 'Wi-Fi' },
    { value: 'parking', label: 'Parking' },
  ],
};

test('CheckboxGroupField renders the label and every option', () => {
  render(<CheckboxGroupField field={field} value={[]} onChange={() => {}} />);
  assert.ok(screen.getByText('Perks *'));
  assert.ok(screen.getByRole('button', { name: 'Wi-Fi' }));
  assert.ok(screen.getByRole('button', { name: 'Parking' }));
});

test('CheckboxGroupField adds a value when its option is clicked', () => {
  let lastValue: unknown;
  render(<CheckboxGroupField field={field} value={['wifi']} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
  assert.deepEqual(lastValue, ['wifi', 'parking']);
});

test('CheckboxGroupField removes a value when its selected option is clicked again', () => {
  let lastValue: unknown;
  render(<CheckboxGroupField field={field} value={['wifi', 'parking']} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
  assert.deepEqual(lastValue, ['parking']);
});

test('CheckboxGroupField treats a non-array value as no selection', () => {
  let lastValue: unknown;
  render(<CheckboxGroupField field={field} value={undefined} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
  assert.deepEqual(lastValue, ['wifi']);
});

test('CheckboxGroupField does not fire onChange while disabled', () => {
  let fired = false;
  render(<CheckboxGroupField field={field} value={[]} onChange={() => (fired = true)} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
  assert.equal(fired, false);
});

test('CheckboxGroupField shows the error message instead of help text when both are present', () => {
  render(
    <CheckboxGroupField
      field={{ ...field, helpText: 'Pick any that apply' }}
      value={[]}
      onChange={() => {}}
      error="Select at least one perk"
    />,
  );
  assert.ok(screen.getByText('Select at least one perk'));
  assert.equal(screen.queryByText('Pick any that apply'), null);
});
