import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import {
  CheckboxGlyph,
  FieldHint,
  FieldShell,
  NativeInput,
  PickerChip,
  PickerEmptyState,
  PickerFilterChips,
  PickerPanel,
  PickerResultRow,
  fieldBoxClass,
  useClickOutside,
  useDebouncedValue,
  usePickerSearch,
  usePickerSelection,
} from './shared';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
}

// ── FieldHint ──────────────────────────────────────────────────────────────

test('FieldHint renders the error message and hides help text when both are present', () => {
  render(<FieldHint error="Required" helpText="Some help" />);
  assert.ok(screen.getByText('Required'));
  assert.equal(screen.queryByText('Some help'), null);
});

test('FieldHint falls back to help text when there is no error', () => {
  render(<FieldHint helpText="Some help" />);
  assert.ok(screen.getByText('Some help'));
});

test('FieldHint renders nothing when neither error nor help text is set', () => {
  const { container } = render(<FieldHint />);
  assert.equal(container.textContent, '');
});

// ── FieldShell ─────────────────────────────────────────────────────────────

test('FieldShell renders the label with a required marker, its children, and an error hint', () => {
  render(
    <FieldShell id="f1" label="Reason" required error="Required">
      <input id="f1" data-testid="control" />
    </FieldShell>,
  );
  const label = document.querySelector('label') as HTMLLabelElement;
  assert.equal(label.textContent, 'Reason *');
  assert.equal(label.getAttribute('for'), 'f1');
  assert.ok(screen.getByTestId('control'));
  assert.ok(screen.getByText('Required'));
});

test('FieldShell omits the required marker when not required', () => {
  render(
    <FieldShell label="Reason">
      <span />
    </FieldShell>,
  );
  const label = document.querySelector('label') as HTMLLabelElement;
  assert.equal(label.textContent, 'Reason');
});

// ── fieldBoxClass ────────────────────────────────────────────────────────

test('fieldBoxClass applies the error and disabled modifiers independently', () => {
  assert.match(fieldBoxClass(false, false), /border-line\b/);
  assert.doesNotMatch(fieldBoxClass(false, false), /border-danger/);
  assert.doesNotMatch(fieldBoxClass(false, false), /opacity-50/);
  assert.match(fieldBoxClass(true, false), /border-danger/);
  assert.match(fieldBoxClass(false, true), /opacity-50/);
});

// ── NativeInput ──────────────────────────────────────────────────────────

test('NativeInput reflects the given value and reports changes', () => {
  let lastValue = '';
  render(<NativeInput id="name" type="text" value="Priya" onChange={(v) => (lastValue = v)} placeholder="Name" />);
  const input = screen.getByPlaceholderText('Name') as HTMLInputElement;
  assert.equal(input.value, 'Priya');
  fireEvent.change(input, { target: { value: 'Ravi' } });
  assert.equal(lastValue, 'Ravi');
});

test('NativeInput disables the input when disabled is set', () => {
  render(<NativeInput id="name" type="text" value="" onChange={() => {}} disabled />);
  const input = screen.getByDisplayValue('') as HTMLInputElement;
  assert.equal(input.disabled, true);
});

// ── CheckboxGlyph ────────────────────────────────────────────────────────

test('CheckboxGlyph shows a check icon only when checked', () => {
  const { container, rerender } = render(<CheckboxGlyph checked={false} />);
  assert.equal(container.querySelector('svg'), null);
  rerender(<CheckboxGlyph checked={true} />);
  assert.ok(container.querySelector('svg'));
});

// ── useDebouncedValue ────────────────────────────────────────────────────

test('useDebouncedValue holds the previous value until the delay elapses', async () => {
  const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value), {
    initialProps: { value: 'a' },
  });
  assert.equal(result.current, 'a');

  rerender({ value: 'b' });
  assert.equal(result.current, 'a');

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  assert.equal(result.current, 'b');
});

// ── useClickOutside ──────────────────────────────────────────────────────

function ClickOutsideHost({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useClickOutside(onClose, active);
  return (
    <div>
      <div ref={ref} data-testid="inside">
        Inside
      </div>
      <div data-testid="outside">Outside</div>
    </div>
  );
}

test('useClickOutside closes on an outside pointer-down but not on an inside one', () => {
  let closed = false;
  render(<ClickOutsideHost active onClose={() => (closed = true)} />);

  fireEvent.mouseDown(screen.getByTestId('inside'));
  assert.equal(closed, false);

  fireEvent.mouseDown(screen.getByTestId('outside'));
  assert.equal(closed, true);
});

test('useClickOutside closes on Escape', () => {
  let closed = false;
  render(<ClickOutsideHost active onClose={() => (closed = true)} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(closed, true);
});

test('useClickOutside does nothing while inactive', () => {
  let closed = false;
  render(<ClickOutsideHost active={false} onClose={() => (closed = true)} />);
  fireEvent.mouseDown(screen.getByTestId('outside'));
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(closed, false);
});

// ── usePickerSelection ───────────────────────────────────────────────────

test('usePickerSelection (single) selects a value and can remove it', () => {
  let lastValue: unknown;
  const onChange = (v: unknown) => (lastValue = v);
  const { result, rerender } = renderHook(({ value }: { value: unknown }) => usePickerSelection(value, false, onChange), {
    initialProps: { value: undefined as unknown },
  });
  assert.deepEqual(result.current.selectedIds, []);

  act(() => result.current.select('user-1'));
  assert.equal(lastValue, 'user-1');
  rerender({ value: 'user-1' });
  assert.deepEqual(result.current.selectedIds, ['user-1']);

  act(() => result.current.remove('user-1'));
  assert.equal(lastValue, '');
  rerender({ value: '' });
  assert.deepEqual(result.current.selectedIds, []);
});

test('usePickerSelection (multi) accumulates selections, dedupes, and removes by id', () => {
  let lastValue: unknown;
  const onChange = (v: unknown) => (lastValue = v);
  const { result, rerender } = renderHook(({ value }: { value: unknown }) => usePickerSelection(value, true, onChange), {
    initialProps: { value: [] as string[] },
  });
  assert.deepEqual(result.current.selectedIds, []);

  act(() => result.current.select('user-1'));
  assert.deepEqual(lastValue, ['user-1']);
  rerender({ value: ['user-1'] });

  act(() => result.current.select('user-2'));
  assert.deepEqual(lastValue, ['user-1', 'user-2']);
  rerender({ value: ['user-1', 'user-2'] });

  lastValue = undefined;
  act(() => result.current.select('user-1'));
  assert.equal(lastValue, undefined, 'selecting an already-selected id should be a no-op');

  act(() => result.current.remove('user-1'));
  assert.deepEqual(lastValue, ['user-2']);
});

// ── usePickerSearch ──────────────────────────────────────────────────────

test('usePickerSearch debounces the query before calling search', async () => {
  const calls: (string | undefined)[] = [];
  const search = async (q: string | undefined) => {
    calls.push(q);
    return { rows: [] as Row[] };
  };
  const { rerender } = renderHook(({ query }: { query: string }) => usePickerSearch(true, query, search), {
    initialProps: { query: '' },
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.deepEqual(calls, [undefined]);

  rerender({ query: 'pri' });
  assert.deepEqual(calls, [undefined], 'the debounce timer should not have fired yet');

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  assert.deepEqual(calls, [undefined, 'pri']);
});

test('usePickerSearch flips loading true while pending, false once resolved', async () => {
  let resolveFetch: (value: { rows: Row[] }) => void = () => {};
  const search = () =>
    new Promise<{ rows: Row[] }>((resolve) => {
      resolveFetch = resolve;
    });
  const { result } = renderHook(() => usePickerSearch(true, '', search));
  assert.equal(result.current.loading, true);

  await act(async () => {
    resolveFetch({ rows: [] });
  });
  assert.equal(result.current.loading, false);
});

test('usePickerSearch never calls search while closed', async () => {
  let called = false;
  const search = async () => {
    called = true;
    return { rows: [] as Row[] };
  };
  const { result } = renderHook(() => usePickerSearch(false, '', search));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  assert.equal(called, false);
  assert.equal(result.current.loading, false);
  assert.deepEqual(result.current.results, []);
});

test('usePickerSearch caches previously seen results by id across query changes', async () => {
  const priya: Row = { id: 'user-1', name: 'Priya' };
  const ravi: Row = { id: 'user-2', name: 'Ravi' };
  const search = async (q: string | undefined) => (q ? { rows: [ravi] } : { rows: [priya, ravi] });
  const { result, rerender } = renderHook(({ query }: { query: string }) => usePickerSearch(true, query, search), {
    initialProps: { query: '' },
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(result.current.cache['user-1']?.name, 'Priya');

  rerender({ query: 'ravi' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  assert.deepEqual(result.current.results, [ravi]);
  assert.equal(result.current.cache['user-1']?.name, 'Priya', 'Priya should stay cached even though she dropped out of results');
  assert.equal(result.current.cache['user-2']?.name, 'Ravi');
});

// ── PickerPanel / PickerEmptyState ───────────────────────────────────────

test('PickerPanel renders its children', () => {
  render(
    <PickerPanel>
      <div>Row</div>
    </PickerPanel>,
  );
  assert.ok(screen.getByText('Row'));
});

test('PickerEmptyState renders its children copy', () => {
  render(<PickerEmptyState>No matches found.</PickerEmptyState>);
  assert.ok(screen.getByText('No matches found.'));
});

// ── PickerResultRow ──────────────────────────────────────────────────────

test('PickerResultRow renders title/subtitle, fires onClick, and shows a check icon when selected', () => {
  let clicked = false;
  const { container, rerender } = render(
    <PickerResultRow icon={<span />} title="Priya Shah" subtitle="priya@acme.test" onClick={() => (clicked = true)} />,
  );
  assert.ok(screen.getByText('Priya Shah'));
  assert.ok(screen.getByText('priya@acme.test'));
  assert.equal(container.querySelectorAll('svg').length, 0);

  fireEvent.click(screen.getByRole('button'));
  assert.equal(clicked, true);

  rerender(<PickerResultRow icon={<span />} title="Priya Shah" selected onClick={() => {}} />);
  assert.equal(container.querySelectorAll('svg').length, 1);
});

// ── PickerChip ───────────────────────────────────────────────────────────

test('PickerChip renders the label and calls onRemove when clicked', () => {
  let removed = false;
  render(<PickerChip label="Priya Shah" onRemove={() => (removed = true)} />);
  assert.ok(screen.getByText('Priya Shah'));
  fireEvent.click(screen.getByRole('button'));
  assert.equal(removed, true);
});

// ── PickerFilterChips ────────────────────────────────────────────────────

test('PickerFilterChips renders nothing with fewer than two options', () => {
  const { container } = render(<PickerFilterChips options={[{ value: 'a', label: 'A' }]} active={null} onChange={() => {}} />);
  assert.equal(container.textContent, '');
});

test('PickerFilterChips renders All plus each option and reports the clicked value', () => {
  let picked: string | null = 'unset';
  const options = [
    { value: 'pm', label: 'Project Manager' },
    { value: 'tl', label: 'Tech Lead' },
  ];
  render(<PickerFilterChips options={options} active={null} onChange={(v) => (picked = v)} />);
  assert.ok(screen.getByRole('button', { name: 'All' }));
  assert.ok(screen.getByRole('button', { name: 'Project Manager' }));

  fireEvent.click(screen.getByRole('button', { name: 'Tech Lead' }));
  assert.equal(picked, 'tl');

  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  assert.equal(picked, null);
});

test('PickerFilterChips highlights whichever chip is active', () => {
  const options = [
    { value: 'pm', label: 'PM' },
    { value: 'tl', label: 'TL' },
  ];
  const { rerender } = render(<PickerFilterChips options={options} active={null} onChange={() => {}} />);
  assert.match(screen.getByRole('button', { name: 'All' }).className, /border-brand/);
  assert.doesNotMatch(screen.getByRole('button', { name: 'TL' }).className, /border-brand/);

  rerender(<PickerFilterChips options={options} active="tl" onChange={() => {}} />);
  assert.match(screen.getByRole('button', { name: 'TL' }).className, /border-brand/);
  assert.doesNotMatch(screen.getByRole('button', { name: 'All' }).className, /border-brand/);
});
