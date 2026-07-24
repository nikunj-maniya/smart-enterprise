import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SignaturePadModal } from './SignaturePadModal';

afterEach(cleanup);

// jsdom has no real <canvas> 2D context (getContext('2d') returns null without the optional
// `canvas` npm package), so drawing a stroke and reaching a "confirm" click (which reads
// canvas.toDataURL()) cannot be exercised here — this suite covers the modal's lifecycle and
// button wiring only, per the task's own carve-out for canvas drawing.

test('shows the visitor name and confirm prompt', () => {
  render(
    <SignaturePadModal visitorName="Jordan Lee" onCancel={() => {}} onConfirm={() => {}} submitting={false} error={null} />,
  );
  assert.ok(screen.getByText('Sign in — Jordan Lee'));
});

test('confirm is disabled until there is a stroke and consent, even after ticking consent alone', () => {
  render(
    <SignaturePadModal visitorName="Jordan Lee" onCancel={() => {}} onConfirm={() => {}} submitting={false} error={null} />,
  );
  const confirmButton = screen.getByRole('button', { name: /Confirm check-in/ }) as HTMLButtonElement;
  assert.ok(confirmButton.disabled);
  fireEvent.click(screen.getByRole('checkbox'));
  assert.ok(confirmButton.disabled);
});

test('confirm never fires without a drawn stroke, since a disabled button ignores clicks', () => {
  let confirmed = false;
  render(
    <SignaturePadModal
      visitorName="Jordan Lee"
      onCancel={() => {}}
      onConfirm={() => (confirmed = true)}
      submitting={false}
      error={null}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Confirm check-in/ }));
  assert.equal(confirmed, false);
});

test('clear button is wired up and does not throw without a drawn stroke', () => {
  render(
    <SignaturePadModal visitorName="Jordan Lee" onCancel={() => {}} onConfirm={() => {}} submitting={false} error={null} />,
  );
  assert.doesNotThrow(() => fireEvent.click(screen.getByRole('button', { name: /Clear/ })));
});

test('cancel calls onCancel', () => {
  let cancelled = false;
  render(
    <SignaturePadModal
      visitorName="Jordan Lee"
      onCancel={() => (cancelled = true)}
      onConfirm={() => {}}
      submitting={false}
      error={null}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
  assert.equal(cancelled, true);
});

test('Escape closes the modal via onCancel (Overlay behavior)', () => {
  let cancelled = false;
  render(
    <SignaturePadModal
      visitorName="Jordan Lee"
      onCancel={() => (cancelled = true)}
      onConfirm={() => {}}
      submitting={false}
      error={null}
    />,
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(cancelled, true);
});

test('shows the error message when present', () => {
  render(
    <SignaturePadModal
      visitorName="Jordan Lee"
      onCancel={() => {}}
      onConfirm={() => {}}
      submitting={false}
      error="Check-in failed."
    />,
  );
  assert.ok(screen.getByText('Check-in failed.'));
});

test('shows the submitting label and disables confirm while submitting', () => {
  render(
    <SignaturePadModal visitorName="Jordan Lee" onCancel={() => {}} onConfirm={() => {}} submitting error={null} />,
  );
  const confirmButton = screen.getByRole('button', { name: /Checking in…/ }) as HTMLButtonElement;
  assert.ok(confirmButton.disabled);
});
