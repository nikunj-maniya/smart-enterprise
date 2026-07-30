import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchOverlay } from './SearchOverlay';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

interface Recorded {
  method: string;
  path: string;
  body: unknown;
}

let stubs: Stub[] = [];
let requests: Recorded[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  localStorage.clear();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    // Consume stubs in FIFO order so sequential calls to the same path (e.g. two `/smart-search`
    // questions in one thread) each get their own queued response.
    const stubIndex = stubs.findIndex((s) => s.method === method && s.path === path);
    if (stubIndex === -1) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    const [stub] = stubs.splice(stubIndex, 1);
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function stubSmartSearch(body: unknown, status = 200) {
  stubs.push({ method: 'POST', path: '/smart-search', status, body });
}

function ask(text: string) {
  const textarea = screen.getByPlaceholderText('Ask about leave, WFH, departments, projects, holidays, or your own requests…');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

test('renders nothing when closed', () => {
  const { container } = render(<SearchOverlay open={false} onClose={() => {}} />);
  assert.equal(container.querySelector('textarea'), null);
});

test('shows the empty-state hint before any question is asked', () => {
  render(<SearchOverlay open onClose={() => {}} />);
  assert.ok(
    screen.getByText(
      'Ask a question about leave/WFH, the directory, departments, projects, holidays, your requests, balances, approvals, or visitors to get started.',
    ),
  );
});

test('sending a question renders the user bubble, a thinking state, then the assistant reply', async () => {
  stubSmartSearch({ reply: 'Nobody is on leave next week.', toolUsed: 'queryAbsences', denied: false, rows: [] });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');

  assert.ok(screen.getByText('who is on leave next week'));
  assert.ok(screen.getByText('Thinking…'));
  assert.ok(await screen.findByText('Nobody is on leave next week.'));
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/smart-search');
  assert.deepEqual(requests[0].body, { message: 'who is on leave next week', history: [] });
});

test('a follow-up question in the same thread sends prior turns as history and both stay visible', async () => {
  stubSmartSearch({ reply: 'Jane is on leave for 3 days.', toolUsed: 'queryAbsences', denied: false, rows: [] });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  await screen.findByText('Jane is on leave for 3 days.');

  stubSmartSearch({ reply: 'Bob is also on WFH that week.', toolUsed: 'queryAbsences', denied: false, rows: [] });
  ask('anyone else?');
  await screen.findByText('Bob is also on WFH that week.');

  // both turns still render — the thread accumulates, it isn't wiped per question
  assert.ok(screen.getByText('who is on leave next week'));
  assert.ok(screen.getByText('Jane is on leave for 3 days.'));
  assert.ok(screen.getByText('anyone else?'));
  assert.ok(screen.getByText('Bob is also on WFH that week.'));
  assert.deepEqual(requests[1].body, {
    message: 'anyone else?',
    history: [
      { role: 'user', content: 'who is on leave next week' },
      { role: 'assistant', content: 'Jane is on leave for 3 days.' },
    ],
  });
});

test('renders an absence row table under the assistant bubble when rows are present', async () => {
  stubSmartSearch({
    reply: 'One person is on leave.',
    toolUsed: 'queryAbsences',
    denied: false,
    rows: [
      {
        requestId: 'req-1',
        personId: 'user-1',
        personName: 'Jane Doe',
        departmentId: null,
        departmentName: null,
        projectId: null,
        projectName: null,
        type: 'leave',
        startDate: '2026-08-03',
        endDate: '2026-08-05',
        halfDayCount: null,
      },
    ],
  });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  await screen.findByText('One person is on leave.');
  assert.ok(screen.getByText('Jane Doe'));
  assert.ok(screen.getByText('Leave'));
});

test('renders a project row table with a colored status pill when rows are present', async () => {
  stubSmartSearch({
    reply: 'Here is the project.',
    toolUsed: 'queryProjects',
    denied: false,
    rows: [
      {
        id: 'proj-1',
        name: 'Atlas',
        status: 'active',
        pm: { id: 'user-1', name: 'Jane Doe' },
        techLead: null,
        members: [],
        memberCount: 4,
      },
    ],
  });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('tell me about project atlas');
  await screen.findByText('Here is the project.');
  assert.ok(screen.getByText('Atlas'));
  assert.ok(screen.getByText('Jane Doe'));
  assert.ok(screen.getByText('Active'));
});

test('renders a leave balance row table with the computed remaining column', async () => {
  stubSmartSearch({
    reply: 'Here is your balance.',
    toolUsed: 'queryMyLeaveBalances',
    denied: false,
    rows: [{ leaveTypeId: 'lt-1', leaveTypeName: 'Annual Leave', used: 4, total: 12 }],
  });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('what is my leave balance');
  await screen.findByText('Here is your balance.');
  assert.ok(screen.getByText('Annual Leave'));
  assert.ok(screen.getByText('8'));
});

test('renders a front-desk visitor row table when rows are present', async () => {
  stubSmartSearch({
    reply: 'One visitor is on-site.',
    toolUsed: 'queryFrontDeskVisitors',
    denied: false,
    rows: [
      {
        requestId: 'req-1',
        visitorName: 'Vera Visitor',
        mobile: '9999999999',
        hostName: 'Hank Host',
        purpose: 'Demo',
        visitDatetime: '2026-07-29T10:00:00.000Z',
        outTime: null,
        laptopDetails: null,
        status: 'Checked-In',
        checkInAt: '2026-07-29T10:05:00.000Z',
        checkOutAt: null,
      },
    ],
  });
  render(<SearchOverlay open onClose={() => {}} />);
  ask("who's on-site right now");
  await screen.findByText('One visitor is on-site.');
  assert.ok(screen.getByText('Vera Visitor'));
  assert.ok(screen.getByText('Hank Host'));
});

test('an out-of-scope question gets the fixed decline reply, not a table', async () => {
  stubSmartSearch({
    reply: 'I can only help with information available in smartEnterprise.',
    toolUsed: null,
    denied: false,
    rows: null,
  });
  render(<SearchOverlay open onClose={() => {}} />);
  ask("what's the weather today");
  assert.ok(await screen.findByText('I can only help with information available in smartEnterprise.'));
});

test('a failed request shows a retry-friendly error and Retry resends the same question', async () => {
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  assert.ok(await screen.findByText('Something went wrong. Check your connection and try again.'));
  assert.equal(requests.length, 1);

  stubSmartSearch({ reply: 'Nobody is on leave.', toolUsed: 'queryAbsences', denied: false, rows: [] });
  fireEvent.click(screen.getByText('Retry'));
  assert.ok(await screen.findByText('Nobody is on leave.'));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body, { message: 'who is on leave next week', history: [] });
});

test('Shift+Enter does not send the message', () => {
  render(<SearchOverlay open onClose={() => {}} />);
  const textarea = screen.getByPlaceholderText('Ask about leave, WFH, departments, projects, holidays, or your own requests…');
  fireEvent.change(textarea, { target: { value: 'who is on leave' } });
  fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
  assert.equal(requests.length, 0);
});

test('the Esc badge closes the overlay', () => {
  let closed = false;
  render(<SearchOverlay open onClose={() => (closed = true)} />);
  fireEvent.click(screen.getByText('Esc'));
  assert.equal(closed, true);
});

test('clicking the scrim closes the overlay, clicking the panel does not', () => {
  let closeCount = 0;
  const { container } = render(<SearchOverlay open onClose={() => (closeCount += 1)} />);
  fireEvent.click(screen.getByPlaceholderText('Ask about leave, WFH, departments, projects, holidays, or your own requests…'));
  assert.equal(closeCount, 0);
  fireEvent.click(container.firstElementChild as Element);
  assert.equal(closeCount, 1);
});

test('a sent question is saved under the conversationId the server returns, and later turns resume it', async () => {
  stubSmartSearch({ reply: 'Nobody is on leave.', conversationId: 'conv-1', toolUsed: 'queryAbsences', denied: false, rows: [] });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  await screen.findByText('Nobody is on leave.');
  assert.equal(localStorage.getItem('smartSearch.activeConversationId'), 'conv-1');

  stubSmartSearch({ reply: 'Bob is on WFH.', conversationId: 'conv-1', toolUsed: 'queryAbsences', denied: false, rows: [] });
  ask('anyone else?');
  await screen.findByText('Bob is on WFH.');
  assert.deepEqual(requests[1].body, {
    message: 'anyone else?',
    history: [
      { role: 'user', content: 'who is on leave next week' },
      { role: 'assistant', content: 'Nobody is on leave.' },
    ],
    conversationId: 'conv-1',
  });
});

test('opening the overlay resumes the last active thread stored from a previous session', async () => {
  localStorage.setItem('smartSearch.activeConversationId', 'conv-9');
  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations/conv-9',
    status: 200,
    body: {
      id: 'conv-9',
      title: 'who is on leave next week',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
      messages: [
        { id: 'm1', role: 'user', content: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'Nobody is on leave.', createdAt: '2026-07-29T10:00:01.000Z' },
      ],
    },
  });
  render(<SearchOverlay open onClose={() => {}} />);
  assert.ok(await screen.findByText('Nobody is on leave.'));
  assert.ok(screen.getByText('who is on leave next week'));
});

test('the History view lists past threads and selecting one loads it back into the chat', async () => {
  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations?',
    status: 200,
    body: {
      rows: [
        { id: 'conv-1', title: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  });
  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations/conv-1',
    status: 200,
    body: {
      id: 'conv-1',
      title: 'who is on leave next week',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
      messages: [
        { id: 'm1', role: 'user', content: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'Nobody is on leave.', createdAt: '2026-07-29T10:00:01.000Z' },
      ],
    },
  });
  render(<SearchOverlay open onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  assert.ok(await screen.findByText('who is on leave next week'));

  fireEvent.click(screen.getByText('who is on leave next week'));
  assert.ok(await screen.findByText('Nobody is on leave.'));
  assert.equal(localStorage.getItem('smartSearch.activeConversationId'), 'conv-1');
});

test('the History view shows an empty state when there are no past threads', async () => {
  stubs.push({ method: 'GET', path: '/smart-search/conversations?', status: 200, body: { rows: [], total: 0, page: 1, pageSize: 20 } });
  render(<SearchOverlay open onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  assert.ok(await screen.findByText('No past conversations yet.'));
});

test('New conversation clears the thread and forgets the stored conversationId', async () => {
  stubSmartSearch({ reply: 'Nobody is on leave.', conversationId: 'conv-1', toolUsed: 'queryAbsences', denied: false, rows: [] });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  await screen.findByText('Nobody is on leave.');

  fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
  assert.equal(screen.queryByText('Nobody is on leave.') === null, true);
  assert.equal(localStorage.getItem('smartSearch.activeConversationId'), null);
  assert.ok(
    screen.getByText(
      'Ask a question about leave/WFH, the directory, departments, projects, holidays, your requests, balances, approvals, or visitors to get started.',
    ),
  );
});

test('the History view lets the caller delete a thread after confirming, removing it from the list', async () => {
  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations?',
    status: 200,
    body: {
      rows: [
        { id: 'conv-1', title: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  });
  stubs.push({ method: 'DELETE', path: '/smart-search/conversations/conv-1', status: 204 });
  render(<SearchOverlay open onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  assert.ok(await screen.findByText('who is on leave next week'));

  fireEvent.click(screen.getByRole('button', { name: 'Delete conversation "who is on leave next week"' }));
  assert.ok(screen.getByText('Delete conversation'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

  assert.ok(await screen.findByText('No past conversations yet.'));
  assert.equal(requests.some((r) => r.method === 'DELETE' && r.path === '/smart-search/conversations/conv-1'), true);
});

test('Escape while the delete-confirm dialog is open closes only the dialog, not the whole Search overlay', async () => {
  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations?',
    status: 200,
    body: {
      rows: [
        { id: 'conv-1', title: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  });
  let closed = false;
  render(<SearchOverlay open onClose={() => (closed = true)} />);

  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  assert.ok(await screen.findByText('who is on leave next week'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete conversation "who is on leave next week"' }));
  assert.ok(screen.getByText('Delete conversation'));

  fireEvent.keyDown(window, { key: 'Escape' });

  assert.equal(screen.queryByText('Delete conversation') === null, true);
  assert.equal(closed, false);
  assert.ok(screen.getByText('who is on leave next week'));
});

test('deleting the currently active thread from the History view also clears it from chat view and storage', async () => {
  stubSmartSearch({ reply: 'Nobody is on leave.', conversationId: 'conv-1', toolUsed: 'queryAbsences', denied: false, rows: [] });
  render(<SearchOverlay open onClose={() => {}} />);
  ask('who is on leave next week');
  await screen.findByText('Nobody is on leave.');
  assert.equal(localStorage.getItem('smartSearch.activeConversationId'), 'conv-1');

  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations?',
    status: 200,
    body: {
      rows: [
        { id: 'conv-1', title: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  });
  stubs.push({ method: 'DELETE', path: '/smart-search/conversations/conv-1', status: 204 });

  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  await screen.findByText('who is on leave next week');
  fireEvent.click(screen.getByRole('button', { name: 'Delete conversation "who is on leave next week"' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await screen.findByText('No past conversations yet.');
  assert.equal(localStorage.getItem('smartSearch.activeConversationId'), null);

  fireEvent.click(screen.getByRole('button', { name: 'Back to conversation' }));
  assert.ok(
    screen.getByText(
      'Ask a question about leave/WFH, the directory, departments, projects, holidays, your requests, balances, approvals, or visitors to get started.',
    ),
  );
});

test('the History view shows a retry-friendly error when the thread list fails to load', async () => {
  render(<SearchOverlay open onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'View past conversations' }));
  assert.ok(await screen.findByText('Something went wrong. Check your connection and try again.'));

  stubs.push({
    method: 'GET',
    path: '/smart-search/conversations?',
    status: 200,
    body: {
      rows: [
        { id: 'conv-1', title: 'who is on leave next week', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  });
  fireEvent.click(screen.getByText('Retry'));
  assert.ok(await screen.findByText('who is on leave next week'));
});
