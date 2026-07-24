import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { RadioField } from './RadioField';

afterEach(cleanup);

const field: FormField = {
  key: 'mode',
  label: 'Mode',
  type: 'radio',
  required: true,
  options: [
    { value: 'wfh', label: 'Work From Home' },
    { value: 'office', label: 'Office' },
  ],
};

test('RadioField renders the label and every option', () => {
  render(<RadioField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Mode *'));
  assert.ok(screen.getByRole('button', { name: 'Work From Home' }));
  assert.ok(screen.getByRole('button', { name: 'Office' }));
});

test('RadioField calls onChange with the picked option value', () => {
  let lastValue: unknown;
  render(<RadioField field={field} value="" onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Office' }));
  assert.equal(lastValue, 'office');
});

test('RadioField replaces the previous selection when a different option is picked', () => {
  let lastValue: unknown;
  render(<RadioField field={field} value="wfh" onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Office' }));
  assert.equal(lastValue, 'office');
});

test('RadioField does not fire onChange while disabled', () => {
  let fired = false;
  render(<RadioField field={field} value="" onChange={() => (fired = true)} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Office' }));
  assert.equal(fired, false);
});

test('RadioField shows the error message instead of help text when both are present', () => {
  render(
    <RadioField
      field={{ ...field, helpText: 'Choose one' }}
      value=""
      onChange={() => {}}
      error="Mode is required"
    />,
  );
  assert.ok(screen.getByText('Mode is required'));
  assert.equal(screen.queryByText('Choose one'), null);
});
