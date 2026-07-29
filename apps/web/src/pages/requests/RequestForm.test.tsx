import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequestForm from './RequestForm';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let formStatus = 200;
let formBody: Record<string, unknown> | null = null;
let submitStatus = 201;
let balancesBody: unknown[] = [];
const realFetch = globalThis.fetch;

const itForm = {
  id: 'def_it',
  key: 'it',
  title: 'IT Request',
  version: 1,
  renderer: 'custom',
  status: 'published',
  sections: [
    { order: 0, title: 'Details', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true, options: null, validation: null, visibilityRule: null }] },
  ],
  approvalWorkflow: null,
};

const leaveForm = {
  id: 'def_leave',
  key: 'leave',
  title: 'Leave Request',
  version: 1,
  renderer: 'custom',
  status: 'published',
  sections: [
    {
      order: 0,
      title: 'Details',
      fields: [
        {
          key: 'leave_type',
          label: 'Leave type',
          type: 'single-select',
          required: true,
          options: [{ value: 'Casual Leave', label: 'Casual Leave' }],
          validation: null,
          visibilityRule: null,
        },
        { key: 'number_of_days', label: 'Number of days', type: 'number', required: true, options: null, validation: null, visibilityRule: null },
        { key: 'approver', label: 'Approver', type: 'user-picker', required: false, options: null, validation: null, visibilityRule: null },
      ],
    },
  ],
  approvalWorkflow: { stageRules: { approvers: [{ field: 'approver' }] } },
};

beforeEach(() => {
  requests = [];
  formStatus = 200;
  formBody = null;
  submitStatus = 201;
  balancesBody = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/forms/')) {
      if (formStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load this form.' }), { status: formStatus });
      return new Response(JSON.stringify(formBody), { status: 200 });
    }
    if (method === 'GET' && path === '/leave-balances/me') {
      return new Response(JSON.stringify(balancesBody), { status: 200 });
    }
    if (method === 'POST' && path === '/requests') {
      if (submitStatus !== 201) return new Response(JSON.stringify({ error: 'Validation failed.' }), { status: submitStatus });
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'r-new', formKey: body.formKey, status: 'Pending Approval' }), { status: 201 });
    }
    return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderAt(key: string) {
  return render(
    <MemoryRouter initialEntries={[`/requests/new/${key}`]}>
      <Routes>
        <Route path="/requests/new/:key" element={<RequestForm />} />
        <Route path="/requests/new" element={<div>New request list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('loads the form by key and renders its fields', async () => {
  formBody = itForm;
  renderAt('it');
  assert.ok(await screen.findByText('IT Request'));
  assert.ok(screen.getByLabelText(/Summary/));
});

test('shows an error message when the form fails to load', async () => {
  formStatus = 404;
  renderAt('missing');
  assert.ok(await screen.findByText('Unable to load this form.'));
});

test('blocks submit with a validation error when a required field is empty', async () => {
  formBody = itForm;
  renderAt('it');
  await screen.findByText('IT Request');

  fireEvent.click(screen.getByRole('button', { name: /Submit Request/ }));
  assert.ok(await screen.findByText('This field is required'));
  assert.equal(requests.some((r) => r.method === 'POST'), false);
});

test('submits successfully, shows the confirmation screen, and toasts a success message', async () => {
  formBody = itForm;
  renderAt('it');
  await screen.findByText('IT Request');

  fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'Need a new laptop' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit Request/ }));

  assert.ok(await screen.findByText('Request submitted'));
  assert.ok(await screen.findByText('Request submitted successfully.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/requests');
  assert.deepEqual(post?.body, { formKey: 'it', payload: { summary: 'Need a new laptop' } });
});

test('shows the backend error message in a toast, not inline, when submission fails', async () => {
  formBody = itForm;
  submitStatus = 500; // stub responds with { error: 'Validation failed.' } for any non-201 status
  renderAt('it');
  await screen.findByText('IT Request');

  fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'Need a new laptop' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit Request/ }));

  const toastEl = await screen.findByRole('status');
  assert.equal(toastEl.textContent, 'Validation failed.');
});

test('falls back to a generic toast message when submission fails at the network level (no backend response)', async () => {
  formBody = itForm;
  renderAt('it');
  await screen.findByText('IT Request');
  fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'Need a new laptop' } });

  const priorFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    if ((init?.method ?? 'GET') === 'POST' && path === '/requests') throw new TypeError('Failed to fetch');
    return priorFetch(input, init);
  }) as typeof fetch;

  fireEvent.click(screen.getByRole('button', { name: /Submit Request/ }));

  const toastEl = await screen.findByRole('status');
  assert.equal(toastEl.textContent, 'Something went wrong submitting your request. Please try again.');
});

test('Cancel navigates back to the request-type list', async () => {
  formBody = itForm;
  renderAt('it');
  await screen.findByText('IT Request');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  assert.ok(await screen.findByText('New request list'));
});

test('a leave request over the remaining balance shows a non-blocking warning', async () => {
  formBody = leaveForm;
  balancesBody = [{ leaveTypeId: 'lt1', leaveTypeName: 'Casual Leave', used: 10, total: 12 }];
  renderAt('leave');
  await screen.findByText('Leave Request');

  fireEvent.change(screen.getByLabelText(/Leave type/), { target: { value: 'Casual Leave' } });
  fireEvent.change(screen.getByLabelText(/Number of days/), { target: { value: '5' } });

  assert.ok(await screen.findByText(/exceeds your remaining balance/));
});

test('the approvers preview shows a stage with no approver selected yet', async () => {
  formBody = leaveForm;
  renderAt('leave');
  await screen.findByText('Leave Request');
  assert.ok(await screen.findByText('No approver selected yet'));
  // "Approver" also labels the picker field itself — confirm the preview row specifically.
  assert.equal(screen.getAllByText('Approver').length, 2);
});
