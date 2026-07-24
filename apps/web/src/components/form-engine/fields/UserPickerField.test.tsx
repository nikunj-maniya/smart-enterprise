import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DirectoryUserDto, FormField } from '@se/shared';
import { UserPickerField } from './UserPickerField';

/**
 * usePickerSelection (shared.tsx) derives `selectedIds` straight from the `value` prop every
 * render — it holds no internal state. A plain outer `let` variable mutated inside `onChange`
 * (as other field tests use) never triggers a re-render, so a second select/remove would always
 * see the stale, pre-first-change `value`. This tiny controlled wrapper re-renders with the
 * updated value on every change, like the real FormRenderer parent does.
 */
function ControlledUserPicker({
  field,
  initialValue,
  onValueChange,
}: {
  field: FormField;
  initialValue: unknown;
  onValueChange?: (value: unknown) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <UserPickerField
      field={field}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValueChange?.(v);
      }}
    />
  );
}

interface Recorded {
  method: string;
  search: string | null;
  roles: string | null;
  departments: string | null;
}

let requests: Recorded[] = [];
let rowsForSearch: (search: string | null) => DirectoryUserDto[] = () => [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  rowsForSearch = () => [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const search = url.searchParams.get('search');
    requests.push({
      method,
      search,
      roles: url.searchParams.get('roles'),
      departments: url.searchParams.get('departments'),
    });
    if (url.pathname !== '/directory/users') {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${url.pathname}` }), { status: 500 });
    }
    return new Response(JSON.stringify({ rows: rowsForSearch(search) }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

const priya: DirectoryUserDto = { id: 'user-1', name: 'Priya Shah', email: 'priya@acme.test' };
const ravi: DirectoryUserDto = { id: 'user-2', name: 'Ravi Kumar', email: 'ravi@acme.test' };

const field: FormField = { key: 'approver', label: 'Approver', type: 'user-picker', required: true };

test('UserPickerField loads and lists directory users once the search box is focused', async () => {
  rowsForSearch = () => [priya, ravi];
  render(<UserPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  assert.ok(await screen.findByText('Priya Shah'));
  assert.ok(screen.getByText('Priya Shah'));
  assert.ok(screen.getByText('priya@acme.test'));
  assert.ok(screen.getByText('Ravi Kumar'));
});

test('UserPickerField shows a loading state while the search request is in flight', async () => {
  let resolveFetch: (res: Response) => void = () => {};
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as typeof fetch;
  render(<UserPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  assert.ok(await screen.findByText('Searching…'));

  await act(async () => {
    resolveFetch(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
  });
  assert.ok(await screen.findByText('Start typing to search the employee directory.'));
});

test('UserPickerField shows an empty state once a query has no matches', async () => {
  rowsForSearch = (search) => (search ? [] : [priya]);
  render(<UserPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  assert.ok(await screen.findByText('Priya Shah'));

  fireEvent.change(screen.getByPlaceholderText('Search employee directory'), { target: { value: 'zzz' } });
  assert.ok(await screen.findByText('No matches found.'));
  assert.equal(screen.queryByText('Priya Shah'), null);
});

test('UserPickerField scopes the directory search to the field\'s configured roles/departments', async () => {
  rowsForSearch = () => [priya];
  const scoped: FormField = {
    ...field,
    options: { multi: false, roles: ['project-manager'], departments: ['dept-1'] },
  };
  render(<UserPickerField field={scoped} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  await screen.findByText('Priya Shah');

  const req = requests.find((r) => r.method === 'GET');
  assert.ok(req);
  assert.equal(req.roles, 'project-manager');
  assert.equal(req.departments, 'dept-1');
});

test('UserPickerField hides the role filter chips row when fewer than two roles are configured', async () => {
  rowsForSearch = () => [priya];
  const oneRole: FormField = { ...field, options: { roles: ['project-manager'] } };
  render(<UserPickerField field={oneRole} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  await screen.findByText('Priya Shah');
  assert.equal(screen.queryByRole('button', { name: 'All' }), null);
});

test('UserPickerField narrows the search with a role filter chip and re-fetches', async () => {
  rowsForSearch = (search) => (search ? [] : [priya, ravi]);
  const twoRoles: FormField = { ...field, options: { roles: ['project-manager', 'tech-lead'] } };
  render(<UserPickerField field={twoRoles} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  await screen.findByText('Priya Shah');

  assert.ok(screen.getByRole('button', { name: 'All' }));
  assert.ok(screen.getByRole('button', { name: 'Project Manager' }));
  assert.ok(screen.getByRole('button', { name: 'Tech Lead' }));

  requests = [];
  fireEvent.click(screen.getByRole('button', { name: 'Tech Lead' }));

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  const req = requests.find((r) => r.roles === 'tech-lead');
  assert.ok(req, 'expected a re-fetch scoped to the tech-lead role after picking the filter chip');
});

test('UserPickerField single-select mode fills the input with the chosen user and closes the dropdown', async () => {
  rowsForSearch = () => [priya, ravi];
  let lastValue: unknown;
  render(<ControlledUserPicker field={field} initialValue={undefined} onValueChange={(v) => (lastValue = v)} />);

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  fireEvent.click(await screen.findByText('Priya Shah'));

  assert.equal(lastValue, 'user-1');
  assert.equal(screen.queryByText('Ravi Kumar'), null);
  assert.ok(screen.getByDisplayValue('Priya Shah'));
});

test('UserPickerField multi-select mode accumulates chips and removes a user when its chip is dismissed', async () => {
  rowsForSearch = () => [priya, ravi];
  const multiField: FormField = { ...field, options: { multi: true } };
  let lastValue: unknown = ['user-1'];
  render(
    <ControlledUserPicker
      field={multiField}
      initialValue={lastValue}
      onValueChange={(v) => {
        lastValue = v;
      }}
    />,
  );

  fireEvent.focus(screen.getByPlaceholderText('Search employee directory'));
  fireEvent.click(await screen.findByText('Ravi Kumar'));
  assert.deepEqual(lastValue, ['user-1', 'user-2']);

  // Close the dropdown so only the chip (not also the result row) renders "Priya Shah".
  fireEvent.keyDown(window, { key: 'Escape' });
  const chip = screen.getByText('Priya Shah').closest('span') as HTMLElement;
  fireEvent.click(chip.querySelector('button') as HTMLButtonElement);
  assert.deepEqual(lastValue, ['user-2']);
});
