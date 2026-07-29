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

test('Toast defaults to the success background when no variant is given', () => {
  render(<Toast message="Saved" />);
  assert.equal(screen.getByRole('status').style.backgroundColor, 'rgb(17, 48, 47)');
});

test('Toast renders the danger background for the error variant', () => {
  render(<Toast message="Failed" variant="error" />);
  assert.equal(screen.getByRole('status').style.backgroundColor, 'rgb(229, 72, 77)');
});

test('useToast defaults to the success variant', () => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.show('Created'));
  assert.equal(result.current.variant, 'success');
});

test('useToast.show sets an explicit error variant', () => {
  const { result } = renderHook(() => useToast());
  act(() => result.current.show('Something went wrong', 'error'));
  assert.equal(result.current.variant, 'error');
});
