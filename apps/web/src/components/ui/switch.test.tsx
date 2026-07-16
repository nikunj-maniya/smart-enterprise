import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Switch } from './switch';

afterEach(cleanup);

test('Switch exposes role="switch" with its accessible name and checked state', () => {
  render(<Switch checked={false} onCheckedChange={() => {}} aria-label="Include inactive" />);
  const toggle = screen.getByRole('switch', { name: 'Include inactive' });
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
});

test('Switch reflects checked=true via aria-checked', () => {
  render(<Switch checked onCheckedChange={() => {}} aria-label="Include inactive" />);
  const toggle = screen.getByRole('switch', { name: 'Include inactive' });
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
});

test('Switch calls onCheckedChange with the flipped value on click', () => {
  let next: boolean | undefined;
  render(
    <Switch checked={false} onCheckedChange={(v) => (next = v)} aria-label="Include inactive" />,
  );
  fireEvent.click(screen.getByRole('switch', { name: 'Include inactive' }));
  assert.equal(next, true);
});

test('Switch flips back to false when currently checked', () => {
  let next: boolean | undefined;
  render(<Switch checked onCheckedChange={(v) => (next = v)} aria-label="Include inactive" />);
  fireEvent.click(screen.getByRole('switch', { name: 'Include inactive' }));
  assert.equal(next, false);
});

test('Switch does not fire while disabled', () => {
  let fired = false;
  render(
    <Switch
      checked={false}
      onCheckedChange={() => (fired = true)}
      aria-label="Include inactive"
      disabled
    />,
  );
  fireEvent.click(screen.getByRole('switch', { name: 'Include inactive' }));
  assert.equal(fired, false);
});
