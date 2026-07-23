import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { CheckboxField } from './CheckboxField';

afterEach(cleanup);

const field: FormField = { key: 'consent', label: 'I agree', type: 'checkbox', required: true };

test('CheckboxField renders the label and marks it required', () => {
  render(<CheckboxField field={field} value={false} onChange={() => {}} />);
  assert.ok(screen.getByText('I agree *'));
});

test('CheckboxField renders without the required marker when not required', () => {
  render(<CheckboxField field={{ ...field, required: false }} value={false} onChange={() => {}} />);
  assert.equal(screen.queryByText('I agree *'), null);
  assert.ok(screen.getByText('I agree'));
});

test('CheckboxField toggles from unchecked to checked on click', () => {
  let lastValue: unknown;
  render(<CheckboxField field={field} value={false} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button'));
  assert.equal(lastValue, true);
});

test('CheckboxField toggles from checked to unchecked on click', () => {
  let lastValue: unknown;
  render(<CheckboxField field={field} value={true} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button'));
  assert.equal(lastValue, false);
});

test('CheckboxField does not fire onChange while disabled', () => {
  let fired = false;
  render(<CheckboxField field={field} value={false} onChange={() => (fired = true)} disabled />);
  fireEvent.click(screen.getByRole('button'));
  assert.equal(fired, false);
});

test('CheckboxField shows the error message instead of help text when both are present', () => {
  render(
    <CheckboxField
      field={{ ...field, helpText: 'Read the terms first' }}
      value={false}
      onChange={() => {}}
      error="You must agree to continue"
    />,
  );
  assert.ok(screen.getByText('You must agree to continue'));
  assert.equal(screen.queryByText('Read the terms first'), null);
});
