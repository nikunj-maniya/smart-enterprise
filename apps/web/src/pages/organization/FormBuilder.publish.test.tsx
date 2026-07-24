import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import FormBuilder from './FormBuilder';

/**
 * Split out from FormBuilder.lifecycle.test.tsx: this scenario (a published-status form) has to
 * be the only test() in its file/process. Bisected at length — it isn't the fields, the click, or
 * the assertions; a byte-identical copy of the scenario in an otherwise-empty file always passes
 * in well under a second, but the same scenario reproducibly hangs node:test (even under
 * `--test-name-pattern` filtering to just this one) whenever 3+ sibling test() calls are also
 * registered in the same file. That points to a node:test/tsx scheduling quirk around this specific
 * component + status combination, not a bug in the component or in this test.
 */

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let formsBody: unknown[] = [];
let detailByKey: Record<string, unknown> = {};
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
    if (method === 'POST' && /\/forms\/drafts\/[^/]+\/start$/.test(path)) {
      const key = path.split('/')[3];
      formsBody = (formsBody as { key: string; status: string }[]).map((f) => (f.key === key ? { ...f, status: 'draft' } : f));
      return new Response(JSON.stringify({}), { status: 200 });
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

// A single test() — a second one in this file (even one that never runs) reproducibly hung
// node:test here for reasons we couldn't pin down (see the file-level comment above). Bisection
// also found that querying `getByRole('button', { name: /Add Field/ })` while the page has many
// simultaneously-disabled buttons (the whole published-form toolbar) is itself part of the trigger
// — so this checks the disabled state via a plain DOM query instead of an accessible-role query.
test('a published form shows the start-draft banner, keeps Add Field disabled, and Edit starts a new draft', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request', status: 'published', renderer: 'custom', fieldCount: 1, updatedAt: '2026-06-01T00:00:00.000Z' }];
  detailByKey = { leave: detailFor('leave', [nameField], { status: 'published' }) };
  renderPage();
  const banner = await screen.findByText('This form is published. Start a new draft to make changes.');
  const addField = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Field'));
  assert.equal(addField?.hasAttribute('disabled'), true);

  // "Edit" also matches the per-field icon-only "Edit Full Name" button — scope to the banner.
  fireEvent.click(within(banner.parentElement as HTMLElement).getByRole('button', { name: 'Edit' }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/forms/drafts/leave/start'));
});
