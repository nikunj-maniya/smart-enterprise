import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { TextareaField } from './TextareaField';

afterEach(cleanup);

const field: FormField = { key: 'notes', label: 'Notes', type: 'textarea', required: true };

test('TextareaField renders the label and marks it required', () => {
  render(<TextareaField field={field} value="" onChange={() => {}} />);
  assert.ok(screen.getByText('Notes *'));
});

test('TextareaField renders without the required marker when not required', () => {
  render(<TextareaField field={{ ...field, required: false }} value="" onChange={() => {}} />);
  assert.equal(screen.queryByText('Notes *'), null);
  assert.ok(screen.getByText('Notes'));
});

test('TextareaField shows the current value and calls onChange as the user types', () => {
  let lastValue: unknown;
  render(<TextareaField field={field} value="hi" onChange={(v) => (lastValue = v)} />);
  const textarea = screen.getByDisplayValue('hi') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: 'hi there' } });
  assert.equal(lastValue, 'hi there');
});

test('TextareaField disables the textarea when disabled', () => {
  render(<TextareaField field={field} value="" onChange={() => {}} disabled />);
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  assert.equal(textarea.disabled, true);
});

test('TextareaField renders the error message instead of help text when both are present', () => {
  render(
    <TextareaField
      field={{ ...field, helpText: 'Keep it brief' }}
      value=""
      onChange={() => {}}
      error="Notes is required"
    />,
  );
  assert.ok(screen.getByText('Notes is required'));
  assert.equal(screen.queryByText('Keep it brief'), null);
});
