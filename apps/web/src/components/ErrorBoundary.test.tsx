import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Bomb(): never {
  throw new Error('boom');
}

test('renders children when nothing has thrown', () => {
  render(
    <ErrorBoundary>
      <div>All good</div>
    </ErrorBoundary>,
  );
  assert.ok(screen.getByText('All good'));
});

test('renders the fallback instead of a blank screen when a child throws during render', () => {
  const realConsoleError = console.error;
  console.error = () => {}; // React logs the caught error too — expected noise, not a failure
  try {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
  } finally {
    console.error = realConsoleError;
  }
  assert.ok(screen.getByText('Something went wrong'));
  assert.equal(screen.queryByText('All good') === null, true);
});

test('the fallback offers a clickable Reload button', () => {
  const realConsoleError = console.error;
  console.error = () => {};
  try {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    const reloadButton = screen.getByRole('button', { name: 'Reload' });
    assert.doesNotThrow(() => fireEvent.click(reloadButton));
  } finally {
    console.error = realConsoleError;
  }
});
