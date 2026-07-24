import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import CompanyDetails from './CompanyDetails';

interface Recorded {
  method: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let detailsBody: Record<string, unknown> = {
  name: 'Acme Corp',
  industry: 'Manufacturing',
  size: '50–120',
  website: 'https://acme.com',
};
let putStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  putStatus = 200;
  detailsBody = { name: 'Acme Corp', industry: 'Manufacturing', size: '50–120', website: 'https://acme.com' };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/enterprise-profile') {
      return new Response(JSON.stringify(detailsBody), { status: 200 });
    }
    if (method === 'PUT' && path === '/enterprise-profile') {
      if (putStatus !== 200) {
        return new Response(JSON.stringify({ error: 'Unable to save company details.' }), { status: putStatus });
      }
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(body), { status: 200 });
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
      <CompanyDetails />
    </AuthProvider>,
  );
}

test('renders fetched company details in the fields', async () => {
  renderPage();
  assert.equal((await screen.findByLabelText('Company name') as HTMLInputElement).value, 'Acme Corp');
  assert.equal((screen.getByLabelText('Website') as HTMLInputElement).value, 'https://acme.com');
  assert.equal((screen.getByLabelText('Industry') as HTMLSelectElement).value, 'Manufacturing');
  assert.equal((screen.getByLabelText('Company size') as HTMLSelectElement).value, '50–120');
});

test('a blank company name blocks saving with a validation error', async () => {
  renderPage();
  const nameInput = await screen.findByLabelText('Company name');
  fireEvent.change(nameInput, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

  assert.ok(await screen.findByText('Company name is required.'));
  assert.equal(requests.some((r) => r.method === 'PUT'), false);
});

test('saving valid changes PUTs the update and shows a success message', async () => {
  renderPage();
  const nameInput = await screen.findByLabelText('Company name');
  fireEvent.change(nameInput, { target: { value: 'Acme Corporation' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

  assert.ok(await screen.findByText('Company details saved.'));
  const put = requests.find((r) => r.method === 'PUT');
  assert.ok(put);
  assert.deepEqual(put.body, {
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    size: '50–120',
    website: 'https://acme.com',
  });
});

test('a failed save surfaces the API error', async () => {
  putStatus = 400;
  renderPage();
  await screen.findByLabelText('Company name');
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

  assert.ok(await screen.findByText('Unable to save company details.'));
});

test('a legacy industry value not in the fixed list is still shown and selectable', async () => {
  detailsBody = { name: 'Acme Corp', industry: 'Some Old Industry', size: null, website: null };
  renderPage();
  const select = (await screen.findByLabelText('Industry')) as HTMLSelectElement;
  assert.equal(select.value, 'Some Old Industry');
  assert.ok(screen.getByRole('option', { name: 'Some Old Industry' }));
});
