import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
  cleanup();
});

test('renders nothing while online', () => {
  setOnline(true);
  render(<OfflineBanner />);
  assert.equal(screen.queryByText(/you're offline/i), null);
});

test('shows the banner on mount when the browser already reports offline', () => {
  setOnline(false);
  render(<OfflineBanner />);
  assert.ok(screen.getByText(/you're offline/i));
});

test('shows the banner once an "offline" event fires', () => {
  setOnline(true);
  render(<OfflineBanner />);
  assert.equal(screen.queryByText(/you're offline/i), null);
  act(() => {
    setOnline(false);
    window.dispatchEvent(new window.Event('offline'));
  });
  assert.ok(screen.getByText(/you're offline/i));
});

test('hides the banner again once an "online" event fires', () => {
  setOnline(false);
  render(<OfflineBanner />);
  assert.ok(screen.getByText(/you're offline/i));
  act(() => {
    setOnline(true);
    window.dispatchEvent(new window.Event('online'));
  });
  assert.equal(screen.queryByText(/you're offline/i), null);
});
