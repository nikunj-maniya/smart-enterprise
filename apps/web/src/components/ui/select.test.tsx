import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Select } from './select';

afterEach(cleanup);

function DeptSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Department">
      <option value="">All departments</option>
      <option value="d1">Engineering</option>
      <option value="d2">Finance</option>
    </Select>
  );
}

test('Select is reachable by role and accessible name and shows its options', () => {
  render(<DeptSelect value="" onChange={() => {}} />);
  const select = screen.getByRole('combobox', { name: 'Department' });
  assert.ok(select);
  assert.ok(screen.getByRole('option', { name: 'All departments' }));
  assert.ok(screen.getByRole('option', { name: 'Engineering' }));
});

test('Select shows the chosen option as selected', () => {
  render(<DeptSelect value="d2" onChange={() => {}} />);
  const select = screen.getByRole('combobox', { name: 'Department' }) as HTMLSelectElement;
  assert.equal(select.value, 'd2');
});

test('Select reports the newly picked value through onChange', () => {
  let picked: string | undefined;
  render(<DeptSelect value="" onChange={(v) => (picked = v)} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), {
    target: { value: 'd1' },
  });
  assert.equal(picked, 'd1');
});

test('Select stays controlled — the value only moves when the prop does', () => {
  const { rerender } = render(<DeptSelect value="" onChange={() => {}} />);
  const select = screen.getByRole('combobox', { name: 'Department' }) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'd1' } });
  assert.equal(select.value, '');
  rerender(<DeptSelect value="d1" onChange={() => {}} />);
  assert.equal(select.value, 'd1');
});
