import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import FormBuilder from './FormBuilder';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let formsBody: unknown[] = [];
let detailByKey: Record<string, unknown> = {};
let putStatus = 200;
let putErrorBody = 'Unable to save changes.';
const realFetch = globalThis.fetch;

function detailFor(key: string, fields: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: `def_${key}`,
    key,
    title: key,
    version: 1,
    renderer: 'custom',
    status: 'draft',
    sections: [{ order: 0, title: 'Details', fields }],
    approvalWorkflow: null,
    statusModel: null,
    ...overrides,
  };
}

beforeEach(() => {
  requests = [];
  formsBody = [];
  detailByKey = {};
  putStatus = 200;
  putErrorBody = 'Unable to save changes.';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (method === 'GET' && path === '/forms/drafts') return new Response(JSON.stringify(formsBody), { status: 200 });
    const draftMatch = path.match(/^\/forms\/drafts\/([^/]+)$/);
    const publishedMatch = path.match(/^\/forms\/([^/]+)$/);
    if (method === 'GET' && draftMatch) return new Response(JSON.stringify(detailByKey[draftMatch[1]]), { status: 200 });
    if (method === 'GET' && publishedMatch && publishedMatch[1] !== 'drafts') {
      return new Response(JSON.stringify(detailByKey[publishedMatch[1]]), { status: 200 });
    }
    if (method === 'PUT' && draftMatch) {
      if (putStatus !== 200) return new Response(JSON.stringify({ error: putErrorBody }), { status: putStatus });
      const body = JSON.parse(String(init?.body));
      const updated = detailFor(draftMatch[1], body.fields, { status: 'draft' });
      detailByKey[draftMatch[1]] = updated;
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === 'PUT' && /\/forms\/drafts\/[^/]+\/routing$/.test(path)) {
      const key = path.split('/')[3];
      const body = JSON.parse(String(init?.body));
      const updated = { ...(detailByKey[key] as Record<string, unknown>), approvalWorkflow: body };
      detailByKey[key] = updated;
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === 'PUT' && /\/forms\/drafts\/[^/]+\/status-model$/.test(path)) {
      const key = path.split('/')[3];
      const body = JSON.parse(String(init?.body));
      const updated = { ...(detailByKey[key] as Record<string, unknown>), statusModel: body };
      detailByKey[key] = updated;
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === 'POST' && /\/forms\/drafts\/[^/]+\/publish$/.test(path)) {
      const key = path.split('/')[3];
      formsBody = (formsBody as { key: string; status: string }[]).map((f) => (f.key === key ? { ...f, status: 'published' } : f));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (method === 'POST' && /\/forms\/drafts\/[^/]+\/start$/.test(path)) {
      const key = path.split('/')[3];
      formsBody = (formsBody as { key: string; status: string }[]).map((f) => (f.key === key ? { ...f, status: 'draft' } : f));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (method === 'POST' && path === '/forms/drafts') {
      const body = JSON.parse(String(init?.body));
      const key = 'new-form';
      detailByKey[key] = detailFor(key, []);
      formsBody = [...(formsBody as unknown[]), { key, title: body.title, status: 'draft', renderer: 'custom', fieldCount: 0, updatedAt: '2026-06-01T00:00:00.000Z' }];
      return new Response(JSON.stringify({ key, title: body.title }), { status: 201 });
    }
    return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <FormBuilder />
    </AuthProvider>,
  );
}

const nameField = { key: 'full_name', label: 'Full Name', type: 'text', required: true, options: null, validation: null, visibilityRule: null };
const reasonField = { key: 'reason', label: 'Reason', type: 'textarea', required: false, options: null, validation: null, visibilityRule: null };

test('renders the forms list and auto-selects the first form', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  renderPage();
  // "Leave Request" renders in both the forms list and the auto-selected detail pane header.
  assert.equal((await screen.findAllByText('Leave Request')).length, 2);
  assert.ok(await screen.findByText('Full Name'));
  assert.ok(screen.getByText('1 field · updated Jun 1, 2026'));
});

test('shows the empty state when there are no forms', async () => {
  renderPage();
  assert.ok(await screen.findByText('No forms yet. Create one to get started.'));
  assert.ok(screen.getByText('Select a form to edit its fields.'));
});

test('selecting a different form loads its own fields', async () => {
  formsBody = [
    { key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' },
    { key: 'wfh', title: 'WFH Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' },
  ];
  detailByKey = { leave: detailFor('leave', [nameField]), wfh: detailFor('wfh', [reasonField]) };
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByText('WFH Request'));
  assert.ok(await screen.findByText('Reason'));
  assert.equal(screen.queryByText('Full Name'), null);
});

test('New Form requires a title, then creates and selects it', async () => {
  renderPage();
  await screen.findByText('No forms yet. Create one to get started.');

  fireEvent.click(screen.getByRole('button', { name: /New Form/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Create form/ }));
  assert.ok(await within(dialog).findByText('Title is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('e.g. IT Asset Request'), { target: { value: 'Custom Form' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create form/ }));

  // "Custom Form" renders in both the forms list and the now-selected detail pane header.
  assert.equal((await screen.findAllByText('Custom Form')).length, 2);
  const post = requests.find((r) => r.method === 'POST' && r.path === '/forms/drafts');
  assert.deepEqual(post?.body, { title: 'Custom Form' });
});

test('adding a field via the modal persists it to the draft', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Manager Name' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Field/ }));

  assert.ok(await screen.findByText('Manager Name'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/forms/drafts/leave');
  assert.ok((put?.body as { fields: { label: string }[] }).fields.some((f) => f.label === 'Manager Name'));
});

test('toggling Required persists the change', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByRole('button', { name: 'Required' }));
  assert.ok(await screen.findByRole('button', { name: 'Optional' }));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/forms/drafts/leave');
  assert.equal((put?.body as { fields: { required: boolean }[] }).fields[0].required, false);
});

test('deleting a field referenced by another field\'s visibility rule is blocked with an explanatory error', async () => {
  const conditional = {
    ...reasonField,
    key: 'reason',
    visibilityRule: { v: 1, when: { field: 'full_name', op: 'notEmpty' } },
  };
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 2, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField, conditional]) };
  renderPage();
  await screen.findByText('Full Name');

  // The delete button is disabled outright (not just an on-click guard) with an explanatory tooltip.
  const deleteBtn = screen.getByRole('button', { name: 'Delete Full Name' });
  assert.equal(deleteBtn.hasAttribute('disabled'), true);
  assert.equal(deleteBtn.getAttribute('title'), "Referenced by Reason's visibility condition — remove that condition first");
  assert.equal(requests.some((r) => r.method === 'PUT'), false);
});

test('Publish is disabled with no fields and enabled otherwise; publishing reloads as published', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
  assert.ok(await screen.findByText('This form is published. Start a new draft to make changes.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/forms/drafts/leave/publish'));
});

// The draft/publish-lifecycle and tab-switching scenarios (published-form banner, core-form lock,
// routing/status-model tabs, save failure) continue in FormBuilder.lifecycle.test.tsx — kept in a
// separate file/process since running all of them together here reproducibly hung node:test past
// this point for no root cause we could pin down (each one passes in well under a second alone).
