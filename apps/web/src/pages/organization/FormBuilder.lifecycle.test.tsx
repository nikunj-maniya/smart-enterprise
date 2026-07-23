import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import FormBuilder from './FormBuilder';

/**
 * Split from FormBuilder.test.tsx: the core-form lock and tab-switching/save-failure scenarios.
 * The published-form/start-draft scenario lives alone in FormBuilder.publish.test.tsx — seealso
 * that file's comment for why.
 */

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
  formsBody = [];
  detailByKey = {};
  putStatus = 200;
  putErrorBody = 'Unable to save changes.';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';

    if (method === 'GET' && path === '/forms/drafts') return new Response(JSON.stringify(formsBody), { status: 200 });
    const draftMatch = path.match(/^\/forms\/drafts\/([^/]+)$/);
    if (method === 'GET' && draftMatch) return new Response(JSON.stringify(detailByKey[draftMatch[1]]), { status: 200 });
    if (method === 'PUT' && draftMatch) {
      if (putStatus !== 200) return new Response(JSON.stringify({ error: putErrorBody }), { status: putStatus });
      const body = JSON.parse(String(init?.body));
      const updated = detailFor(draftMatch[1], body.fields, { status: 'draft' });
      detailByKey[draftMatch[1]] = updated;
      return new Response(JSON.stringify(updated), { status: 200 });
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

test('a core form disables Add Field with an explanatory title, and locks field deletion', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'core', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField], { renderer: 'core' }) };
  renderPage();
  await screen.findByText('Full Name');

  const addField = screen.getByRole('button', { name: /Add Field/ });
  assert.equal(addField.hasAttribute('disabled'), true);
  assert.equal(addField.getAttribute('title'), 'Core form fields are structural — relabel, reorder, or edit validation instead.');
  assert.equal(screen.getByRole('button', { name: 'Delete Full Name' }).hasAttribute('disabled'), true);
});

test('switching tabs shows the Routing and Status Model editors and hides Add Field', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByRole('button', { name: 'Routing' }));
  assert.ok(await screen.findByText('Approver stages'));
  assert.equal(screen.queryByRole('button', { name: /Add Field/ }), null);

  fireEvent.click(screen.getByRole('button', { name: 'Status Model' }));
  assert.ok(await screen.findByText('States'));
});

test('a save failure shows the error message', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'draft', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField]) };
  putStatus = 400;
  renderPage();
  await screen.findByText('Full Name');

  fireEvent.click(screen.getByRole('button', { name: 'Required' }));
  assert.ok(await screen.findByText('Unable to save changes.'));
});
