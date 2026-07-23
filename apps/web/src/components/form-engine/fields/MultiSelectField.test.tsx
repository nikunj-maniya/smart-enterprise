import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormField } from '@se/shared';
import { MultiSelectField } from './MultiSelectField';

afterEach(cleanup);

const field: FormField = {
  key: 'skills',
  label: 'Skills',
  type: 'multi-select',
  required: true,
  options: [
    { value: 'js', label: 'JavaScript' },
    { value: 'py', label: 'Python' },
    { value: 'go', label: 'Go' },
  ],
};

test('MultiSelectField renders every option unchecked when nothing is selected', () => {
  render(<MultiSelectField field={field} value={[]} onChange={() => {}} />);
  assert.ok(screen.getByText('Skills *'));
  assert.ok(screen.getByRole('button', { name: 'JavaScript' }));
  assert.ok(screen.getByRole('button', { name: 'Python' }));
  assert.ok(screen.getByRole('button', { name: 'Go' }));
});

test('MultiSelectField renders no options and does not crash when options are missing', () => {
  render(<MultiSelectField field={{ ...field, options: undefined }} value={[]} onChange={() => {}} />);
  assert.equal(screen.queryByRole('button', { name: 'JavaScript' }), null);
});

test('MultiSelectField selects an unchosen option by adding it to the value array', () => {
  let lastValue: unknown;
  render(<MultiSelectField field={field} value={['js']} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Python' }));
  assert.deepEqual(lastValue, ['js', 'py']);
});

test('MultiSelectField deselects an already-chosen option by removing it from the value array', () => {
  let lastValue: unknown;
  render(<MultiSelectField field={field} value={['js', 'py']} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'JavaScript' }));
  assert.deepEqual(lastValue, ['py']);
});

test('MultiSelectField ignores a non-array value and treats it as no selection', () => {
  let lastValue: unknown;
  render(<MultiSelectField field={field} value={undefined} onChange={(v) => (lastValue = v)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  assert.deepEqual(lastValue, ['go']);
});

test('MultiSelectField disables every option button when disabled', () => {
  render(<MultiSelectField field={field} value={[]} onChange={() => {}} disabled />);
  for (const name of ['JavaScript', 'Python', 'Go']) {
    assert.equal((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, true);
  }
});
