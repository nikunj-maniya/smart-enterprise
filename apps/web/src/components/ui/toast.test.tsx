import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { Toast, useToast } from './toast';

afterEach(cleanup);

test('Toast renders nothing when there is no message', () => {
  render(<Toast message={null} />);
  assert.equal(screen.queryByRole('status'), null);
});

test('Toast shows the message with role="status" when set', () => {
  render(<Toast message="Saved successfully" />);
  assert.ok(screen.getByRole('status'));
  assert.ok(screen.getByText('Saved successfully'));
});

test('useToast starts with no message', () => {
  const { result } = renderHook(() => useToast());
  assert.equal(result.current.message, null);
});

test('useToast.show sets the message', () => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.show('Created'));
  assert.equal(result.current.message, 'Created');
});

test('useToast clears the message after the default duration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { result } = renderHook(() => useToast());
  act(() => result.current.show('Created'));
  assert.equal(result.current.message, 'Created');
  act(() => t.mock.timers.tick(3000));
  assert.equal(result.current.message, null);
});

test('useToast respects a custom duration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { result } = renderHook(() => useToast(1000));
  act(() => result.current.show('Created'));
  act(() => t.mock.timers.tick(999));
  assert.equal(result.current.message, 'Created');
  act(() => t.mock.timers.tick(1));
  assert.equal(result.current.message, null);
});
