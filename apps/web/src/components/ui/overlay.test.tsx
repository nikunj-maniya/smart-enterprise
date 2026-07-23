import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Overlay } from './overlay';

afterEach(cleanup);

test('Overlay renders its children inside an accessible modal dialog', () => {
  render(
    <Overlay onClose={() => {}}>
      <button>Inner</button>
    </Overlay>,
  );
  const dialog = screen.getByRole('dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok(screen.getByRole('button', { name: 'Inner' }));
});

test('Overlay focuses the first focusable element inside the card on mount', () => {
  render(
    <Overlay onClose={() => {}}>
      <button>First</button>
      <button>Second</button>
    </Overlay>,
  );
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'First' }));
});

test('Overlay applies the given z-index to the scrim', () => {
  render(
    <Overlay onClose={() => {}} z={99}>
      <button>Inner</button>
    </Overlay>,
  );
  const scrim = screen.getByRole('dialog').parentElement as HTMLElement;
  assert.equal(scrim.style.zIndex, '99');
});

test('Overlay calls onClose when the scrim is clicked', () => {
  let closed = false;
  render(
    <Overlay onClose={() => (closed = true)}>
      <button>Inner</button>
    </Overlay>,
  );
  const scrim = screen.getByRole('dialog').parentElement as HTMLElement;
  fireEvent.click(scrim);
  assert.equal(closed, true);
});

test('Overlay does not call onClose when clicking inside the card', () => {
  let closed = false;
  render(
    <Overlay onClose={() => (closed = true)}>
      <button>Inner</button>
    </Overlay>,
  );
  fireEvent.click(screen.getByRole('dialog'));
  assert.equal(closed, false);
});

test('Overlay calls onClose on Escape', () => {
  let closed = false;
  render(
    <Overlay onClose={() => (closed = true)}>
      <button>Inner</button>
    </Overlay>,
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(closed, true);
});

test('Overlay traps Tab focus within the card, wrapping from last back to first', () => {
  render(
    <Overlay onClose={() => {}}>
      <button>First</button>
      <button>Second</button>
    </Overlay>,
  );
  const first = screen.getByRole('button', { name: 'First' });
  const second = screen.getByRole('button', { name: 'Second' });
  second.focus();
  fireEvent.keyDown(window, { key: 'Tab' });
  assert.equal(document.activeElement, first);
});

test('Overlay traps Shift+Tab focus within the card, wrapping from first back to last', () => {
  render(
    <Overlay onClose={() => {}}>
      <button>First</button>
      <button>Second</button>
    </Overlay>,
  );
  const first = screen.getByRole('button', { name: 'First' });
  const second = screen.getByRole('button', { name: 'Second' });
  first.focus();
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, second);
});

function ControlledOverlay() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Trigger</button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <button>Inner</button>
        </Overlay>
      )}
    </>
  );
}

test('Overlay returns focus to the trigger element once it closes', () => {
  render(<ControlledOverlay />);
  const trigger = screen.getByRole('button', { name: 'Trigger' });
  trigger.focus();
  fireEvent.click(trigger);
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Inner' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(document.activeElement, trigger);
});
