import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import SlackIntegration from './SlackIntegration';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let configBody: Record<string, unknown> = {
  status: 'disconnected',
  workspaceName: null,
  defaultChannel: null,
  notifyApproversOnNewRequest: false,
  notifyRequesterOnDecision: false,
  notifyRequesterOnStatusChange: false,
  digestEnabled: false,
  digestChannel: null,
  digestTime: null,
  reminderEnabled: false,
};
let getStatus = 200;
let connectStatus = 200;
let connectErrorBody = 'Could not verify these Slack credentials.';
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  getStatus = 200;
  connectStatus = 200;
  connectErrorBody = 'Could not verify these Slack credentials.';
  configBody = {
    status: 'disconnected',
    workspaceName: null,
    defaultChannel: null,
    notifyApproversOnNewRequest: false,
    notifyRequesterOnDecision: false,
    notifyRequesterOnStatusChange: false,
    digestEnabled: false,
    digestChannel: null,
    digestTime: null,
    reminderEnabled: false,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/slack/config') {
      if (getStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load Slack configuration.' }), { status: getStatus });
      return new Response(JSON.stringify(configBody), { status: 200 });
    }
    if (method === 'POST' && path === '/slack/config/connect') {
      if (connectStatus !== 200) return new Response(JSON.stringify({ error: connectErrorBody }), { status: connectStatus });
      return new Response(JSON.stringify({ ...configBody, status: 'connected', workspaceName: 'Acme' }), { status: 200 });
    }
    if (method === 'POST' && path === '/slack/config/disconnect') {
      return new Response(JSON.stringify({ ...configBody, status: 'disconnected', workspaceName: null }), { status: 200 });
    }
    if (method === 'POST' && path === '/slack/config/test') {
      return new Response(null, { status: 200 });
    }
    if (method === 'PUT' && path === '/slack/config/settings') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ...configBody, ...body }), { status: 200 });
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
      <SlackIntegration />
    </AuthProvider>,
  );
}

test('shows "No workspace connected" and a Disconnected badge by default', async () => {
  renderPage();
  assert.ok(await screen.findByText('No workspace connected'));
  assert.ok(screen.getByText('Disconnected'));
  assert.ok(screen.getByRole('button', { name: 'Connect' }));
});

test('Connect stays disabled until all 3 fields are filled, then posts and shows connected', async () => {
  renderPage();
  await screen.findByText('No workspace connected');

  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  const connectBtn = screen.getByRole('button', { name: /^Connect/ });
  assert.equal(connectBtn.hasAttribute('disabled'), true);

  const connectForm = screen.getByLabelText('Bot token').closest('label')!.parentElement as HTMLElement;
  fireEvent.change(within(connectForm).getByLabelText('Bot token'), { target: { value: 'xoxb-123' } });
  fireEvent.change(within(connectForm).getByLabelText('Signing secret'), { target: { value: 'sig-secret' } });
  fireEvent.change(within(connectForm).getByLabelText(/^Default channel/), { target: { value: 'general' } });
  assert.equal(connectBtn.hasAttribute('disabled'), false);

  fireEvent.click(connectBtn);
  assert.ok(await screen.findByText('Slack workspace connected.'));
  assert.ok(screen.getByText('Acme workspace'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/slack/config/connect');
  assert.deepEqual(post?.body, { botToken: 'xoxb-123', signingSecret: 'sig-secret', defaultChannel: 'general' });
});

test('a failed connect surfaces the error inside the connect form', async () => {
  connectStatus = 400;
  renderPage();
  await screen.findByText('No workspace connected');
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  const connectForm = screen.getByLabelText('Bot token').closest('label')!.parentElement as HTMLElement;
  fireEvent.change(within(connectForm).getByLabelText('Bot token'), { target: { value: 'xoxb-123' } });
  fireEvent.change(within(connectForm).getByLabelText('Signing secret'), { target: { value: 'sig-secret' } });
  fireEvent.change(within(connectForm).getByLabelText(/^Default channel/), { target: { value: 'general' } });
  fireEvent.click(screen.getByRole('button', { name: /^Connect/ }));
  assert.ok(await screen.findByText('Could not verify these Slack credentials.'));
});

test('Cancel closes the connect form without submitting', async () => {
  renderPage();
  await screen.findByText('No workspace connected');
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  assert.equal(screen.queryByLabelText('Bot token'), null);
});

test('a connected workspace shows Disconnect and Test connection, which post and toast', async () => {
  configBody = { ...configBody, status: 'connected', workspaceName: 'Acme' };
  renderPage();
  await screen.findByText('Acme workspace');
  assert.ok(screen.getByText('Connected'));

  fireEvent.click(screen.getByRole('button', { name: /Test connection/ }));
  assert.ok(await screen.findByText('Test message sent to Slack.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/slack/config/test'));

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  assert.ok(await screen.findByText('Slack workspace disconnected.'));
  assert.ok(await screen.findByText('No workspace connected'));
});

test('an error-status config shows the last error message', async () => {
  configBody = { ...configBody, status: 'error', workspaceName: 'Acme', lastErrorMessage: 'Token revoked by workspace admin.' };
  renderPage();
  assert.ok(await screen.findByText('Token revoked by workspace admin.'));
  assert.ok(screen.getByText('Error'));
});

test('enabling the digest toggle reveals channel/time fields', async () => {
  renderPage();
  await screen.findByText('No workspace connected');
  fireEvent.click(screen.getAllByRole('switch')[3]);
  assert.ok(screen.getByLabelText(/^Digest channel/));
  assert.ok(screen.getByLabelText('Post at'));
});

test('Save Settings PUTs the toggled notification preferences', async () => {
  renderPage();
  await screen.findByText('No workspace connected');
  fireEvent.click(screen.getAllByRole('switch')[0]);
  fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));

  assert.ok(await screen.findByText('Slack settings saved.'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/slack/config/settings');
  assert.equal((put?.body as Record<string, unknown>).notifyApproversOnNewRequest, true);
});

test('a load failure shows an error state with a working Retry', async () => {
  getStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load Slack configuration.'));
  getStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('No workspace connected'));
});
