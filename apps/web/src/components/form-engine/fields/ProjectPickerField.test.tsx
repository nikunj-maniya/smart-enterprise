import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DirectoryProjectDto, FormField } from '@se/shared';
import { ProjectPickerField } from './ProjectPickerField';

interface Recorded {
  method: string;
  search: string | null;
}

let requests: Recorded[] = [];
let rowsForSearch: (search: string | null) => DirectoryProjectDto[] = () => [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  rowsForSearch = () => [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const search = url.searchParams.get('search');
    requests.push({ method, search });
    if (url.pathname !== '/directory/projects') {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${url.pathname}` }), { status: 500 });
    }
    return new Response(JSON.stringify({ rows: rowsForSearch(search) }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

const alpha: DirectoryProjectDto = { id: 'proj-1', name: 'Alpha Migration' };
const beta: DirectoryProjectDto = { id: 'proj-2', name: 'Beta Rollout' };

const field: FormField = { key: 'project', label: 'Project', type: 'project-picker', required: true };

test('ProjectPickerField loads and lists projects once the search box is focused', async () => {
  rowsForSearch = () => [alpha, beta];
  render(<ProjectPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  assert.ok(await screen.findByText('Alpha Migration'));
  assert.ok(screen.getByText('Beta Rollout'));
});

test('ProjectPickerField shows a loading state while the search request is in flight', async () => {
  let resolveFetch: (res: Response) => void = () => {};
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as typeof fetch;
  render(<ProjectPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  assert.ok(await screen.findByText('Searching…'));

  await act(async () => {
    resolveFetch(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
  });
  assert.ok(await screen.findByText('Start typing to search projects.'));
});

test('ProjectPickerField shows an empty state distinct from the unopened placeholder once a query has no matches', async () => {
  rowsForSearch = (search) => (search ? [] : [alpha]);
  render(<ProjectPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  assert.ok(await screen.findByText('Alpha Migration'));

  fireEvent.change(screen.getByPlaceholderText('Search projects'), { target: { value: 'zzz' } });
  assert.ok(await screen.findByText('No matches found.'));
  assert.equal(screen.queryByText('Alpha Migration'), null);
});

test('ProjectPickerField debounces the search request as the user types', async () => {
  rowsForSearch = (search) => (search === 'Alp' ? [alpha] : [alpha, beta]);
  render(<ProjectPickerField field={field} value={undefined} onChange={() => {}} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  await screen.findByText('Alpha Migration');

  fireEvent.change(screen.getByPlaceholderText('Search projects'), { target: { value: 'Alp' } });
  // Wait for the debounced 'Alp' search to actually apply (Beta Rollout drops out of the
  // filtered results) before asserting — checking immediately races the 300ms debounce timer.
  // Comparing to a boolean rather than asserting on the raw element directly: a failed
  // assert.equal/deepEqual on a live DOM node makes Node try to format it for the diff, which
  // can hang/OOM on jsdom's circular element graph instead of failing fast.
  await waitFor(() => assert.equal(screen.queryByText('Beta Rollout') === null, true));
  assert.ok(await screen.findByText('Alpha Migration'));

  const searchRequests = requests.filter((r) => r.search === 'Alp');
  assert.ok(searchRequests.length > 0, 'expected a request for the "Alp" search term');
});

test('ProjectPickerField single-select mode fills the input with the chosen project and closes the dropdown', async () => {
  rowsForSearch = () => [alpha, beta];
  let lastValue: unknown;
  const { rerender } = render(<ProjectPickerField field={field} value={undefined} onChange={(v) => (lastValue = v)} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  fireEvent.click(await screen.findByText('Alpha Migration'));

  assert.equal(lastValue, 'proj-1');
  // singleSelected is derived from the `value` prop, so the input only shows the chosen
  // project's name once the component is re-rendered with it, like a real controlled parent would.
  rerender(<ProjectPickerField field={field} value={lastValue} onChange={(v) => (lastValue = v)} />);
  assert.equal(screen.queryByText('Beta Rollout') === null, true);
  assert.ok(screen.getByDisplayValue('Alpha Migration'));
});

test('ProjectPickerField multi-select mode accumulates chips and re-clicking a selected row is a no-op', async () => {
  rowsForSearch = () => [alpha, beta];
  const multiField: FormField = { ...field, options: { multi: true } };
  let lastValue: unknown;
  const { rerender } = render(<ProjectPickerField field={multiField} value={[]} onChange={(v) => (lastValue = v)} />);

  fireEvent.focus(screen.getByPlaceholderText('Search projects'));
  fireEvent.click(await screen.findByText('Alpha Migration'));
  assert.deepEqual(lastValue, ['proj-1']);
  // Dropdown stays open in multi mode.
  assert.ok(screen.getByText('Beta Rollout'));

  // select() derives selectedIds from the `value` prop, so the no-op check only holds if the
  // component is re-rendered with the updated value first, like a real controlled parent would.
  rerender(<ProjectPickerField field={multiField} value={lastValue as string[]} onChange={(v) => (lastValue = v)} />);

  // Both the result row and the now-rendered chip show "Alpha Migration" — scope to the row button.
  lastValue = undefined;
  fireEvent.click(screen.getByRole('button', { name: 'Alpha Migration' }));
  assert.equal(lastValue, undefined, 'clicking an already-selected project should not call onChange again');
});

test('ProjectPickerField multi-select mode removes a project when its chip is dismissed', () => {
  let lastValue: unknown;
  render(
    <ProjectPickerField
      field={{ ...field, options: { multi: true } }}
      value={['proj-1', 'proj-2']}
      onChange={(v) => (lastValue = v)}
    />,
  );
  // Neither project has been fetched into cache yet, so chips fall back to raw ids.
  const chip = screen.getByText('proj-1').closest('span') as HTMLElement;
  fireEvent.click(chip.querySelector('button') as HTMLButtonElement);
  assert.deepEqual(lastValue, ['proj-2']);
});
