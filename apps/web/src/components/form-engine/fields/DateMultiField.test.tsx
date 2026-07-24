import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { DateMultiField } from './DateMultiField';

afterEach(cleanup);

const field: FormField = { key: 'halfDays', label: 'Half days', type: 'date-multi', required: false };

test('DateMultiField renders no chips and a disabled Add button when empty', () => {
  render(<DateMultiField field={field} value={[]} onChange={() => {}} />);
  assert.equal(screen.queryByText(/2026-/), null);
  const addButton = screen.getByRole('button', { name: 'Add' });
  assert.equal((addButton as HTMLButtonElement).disabled, true);
});

test('DateMultiField renders a required marker and a chip per existing date', () => {
  render(<DateMultiField field={{ ...field, required: true }} value={['2026-07-01', '2026-07-03']} onChange={() => {}} />);
  assert.ok(screen.getByText('Half days *'));
  assert.ok(screen.getByText('2026-07-01'));
  assert.ok(screen.getByText('2026-07-03'));
});

test('DateMultiField enables Add once a date is picked, then adds it and clears the pending input', () => {
  let lastValue: unknown;
  render(<DateMultiField field={field} value={[]} onChange={(v) => (lastValue = v)} />);
  const dateInput = screen.getByLabelText('Half days') as HTMLInputElement;
  const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;

  fireEvent.change(dateInput, { target: { value: '2026-07-10' } });
  assert.equal(addButton.disabled, false);

  fireEvent.click(addButton);
  assert.deepEqual(lastValue, ['2026-07-10']);
  assert.equal(dateInput.value, '');
});

test('DateMultiField inserts a newly added date in sorted order', () => {
  let lastValue: unknown;
  render(<DateMultiField field={field} value={['2026-07-10']} onChange={(v) => (lastValue = v)} />);
  fireEvent.change(screen.getByLabelText('Half days'), { target: { value: '2026-06-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  assert.deepEqual(lastValue, ['2026-06-15', '2026-07-10']);
});

test('DateMultiField does not add a duplicate of an already-selected date', () => {
  let called = false;
  render(
    <DateMultiField
      field={field}
      value={['2026-07-10']}
      onChange={() => {
        called = true;
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Half days'), { target: { value: '2026-07-10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  assert.equal(called, false);
});

test('DateMultiField removes a date when its chip is dismissed', () => {
  let lastValue: unknown;
  render(
    <DateMultiField
      field={field}
      value={['2026-07-01', '2026-07-03']}
      onChange={(v) => (lastValue = v)}
    />,
  );
  const chip = screen.getByText('2026-07-01').closest('span') as HTMLElement;
  fireEvent.click(chip.querySelector('button') as HTMLButtonElement);
  assert.deepEqual(lastValue, ['2026-07-03']);
});

test('DateMultiField disables the pending date input and Add button when disabled', () => {
  render(<DateMultiField field={field} value={[]} onChange={() => {}} disabled />);
  assert.equal((screen.getByLabelText('Half days') as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled, true);
});
