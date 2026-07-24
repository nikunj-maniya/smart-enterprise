import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch,
  tokenStore,
  ApiError,
  searchDirectoryUsers,
  searchDirectoryProjects,
  listPublishedForms,
  getPublishedForm,
  submitRequest,
  listMyRequests,
  getRequestDetail,
  listApprovalQueue,
  transitionRequest,
  decideOnRequest,
  listLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  listMyLeaveBalances,
  getFrontDeskToday,
  listItemCatalog,
  createItemCatalog,
  updateItemCatalog,
  deleteItemCatalog,
  getFulfilmentQueue,
  claimFulfilmentRequest,
  listAbsences,
  getOverCapDays,
  getAbsenceCap,
  updateAbsenceCap,
  globalSearch,
  getSlackConfig,
  connectSlack,
  disconnectSlack,
  testSlackConnection,
  updateSlackSettings,
  getNotificationPreferences,
  updateNotificationPreference,
  getReportSummary,
  downloadAbsencesCsv,
  checkInWithSignature,
  getVisitorSignatureUrl,
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getAttendanceReport,
  downloadAttendanceCsv,
} from './api';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}

let stubs: Stub[] = [];
let requests: Recorded[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  tokenStore.clear();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers,
    });
    const stub = stubs.find((s) => s.method === method && s.path === path);
    if (!stub) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  tokenStore.clear();
});

// ── tokenStore ──────────────────────────────────────────────

test('tokenStore.set persists both tokens; tokenStore.clear removes them', () => {
  assert.equal(tokenStore.access, null);
  tokenStore.set('at-1', 'rt-1');
  assert.equal(tokenStore.access, 'at-1');
  assert.equal(localStorage.getItem('se.refreshToken'), 'rt-1');
  tokenStore.clear();
  assert.equal(tokenStore.access, null);
  assert.equal(localStorage.getItem('se.refreshToken'), null);
});

// ── apiFetch core behavior ───────────────────────────────────

test('apiFetch sends a Content-Type header but no Authorization header when unauthenticated', async () => {
  stubs.push({ method: 'GET', path: '/forms', status: 200, body: [] });
  await apiFetch('/forms');
  assert.equal(requests[0].headers['content-type'], 'application/json');
  assert.equal(requests[0].headers['authorization'], undefined);
});

test('apiFetch injects a Bearer token once one is stored', async () => {
  tokenStore.set('token-123', 'refresh-123');
  stubs.push({ method: 'GET', path: '/forms', status: 200, body: [] });
  await apiFetch('/forms');
  assert.equal(requests[0].headers['authorization'], 'Bearer token-123');
});

test('apiFetch resolves the parsed JSON body on a 200', async () => {
  stubs.push({ method: 'GET', path: '/forms', status: 200, body: [{ key: 'leave' }] });
  const result = await apiFetch('/forms');
  assert.deepEqual(result, [{ key: 'leave' }]);
});

test('apiFetch resolves null on a 204 without attempting to parse a body', async () => {
  stubs.push({ method: 'DELETE', path: '/holidays/h1', status: 204 });
  const result = await apiFetch('/holidays/h1', { method: 'DELETE' });
  assert.equal(result, null);
});

test('apiFetch throws a typed ApiError carrying the server message and field details on a 400', async () => {
  stubs.push({
    method: 'POST',
    path: '/leave-types',
    status: 400,
    body: { error: 'Validation failed', details: { name: ['Name is required'] } },
  });
  await assert.rejects(
    () => apiFetch('/leave-types', { method: 'POST', body: JSON.stringify({}) }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.message, 'Validation failed');
      assert.deepEqual(err.details, { name: ['Name is required'] });
      return true;
    },
  );
});

test('apiFetch falls back to a generic message when the error body has no `error` field', async () => {
  stubs.push({ method: 'GET', path: '/forms', status: 500, body: {} });
  await assert.rejects(
    () => apiFetch('/forms'),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.message, 'Request failed (500)');
      return true;
    },
  );
});

test('apiFetch falls back to a generic message when the error response body is not JSON', async () => {
  globalThis.fetch = (async () => new Response('not json', { status: 502 })) as typeof fetch;
  await assert.rejects(
    () => apiFetch('/forms'),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal((err as ApiError).status, 502);
      assert.equal((err as ApiError).message, 'Request failed (502)');
      return true;
    },
  );
});

// ── Directory search ─────────────────────────────────────────

test('searchDirectoryUsers builds a query string from every provided filter', async () => {
  stubs.push({
    method: 'GET',
    path: '/directory/users?search=john&roles=project-manager&departments=eng&limit=5',
    status: 200,
    body: { rows: [], total: 0 },
  });
  await searchDirectoryUsers({ search: 'john', roles: ['project-manager'], departments: ['eng'], limit: 5 });
  assert.equal(requests[0].path, '/directory/users?search=john&roles=project-manager&departments=eng&limit=5');
});

test('searchDirectoryUsers omits unset filters entirely', async () => {
  stubs.push({ method: 'GET', path: '/directory/users?', status: 200, body: { rows: [], total: 0 } });
  await searchDirectoryUsers({});
  assert.equal(requests[0].path, '/directory/users?');
});

test('searchDirectoryProjects builds a query string from search and limit', async () => {
  stubs.push({ method: 'GET', path: '/directory/projects?search=proj&limit=3', status: 200, body: { rows: [] } });
  await searchDirectoryProjects({ search: 'proj', limit: 3 });
  assert.equal(requests[0].path, '/directory/projects?search=proj&limit=3');
});

// ── Forms / requests ──────────────────────────────────────────

test('listPublishedForms issues a GET to /forms', async () => {
  stubs.push({ method: 'GET', path: '/forms', status: 200, body: [{ key: 'leave' }] });
  const result = await listPublishedForms();
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].path, '/forms');
  assert.deepEqual(result, [{ key: 'leave' }]);
});

test('getPublishedForm issues a GET to /forms/:key', async () => {
  stubs.push({ method: 'GET', path: '/forms/leave', status: 200, body: { key: 'leave' } });
  await getPublishedForm('leave');
  assert.equal(requests[0].path, '/forms/leave');
});

test('submitRequest POSTs the form key and payload to /requests', async () => {
  stubs.push({ method: 'POST', path: '/requests', status: 201, body: { id: 'req-1' } });
  await submitRequest('leave', { reason: 'Doctor visit' });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/requests');
  assert.deepEqual(requests[0].body, { formKey: 'leave', payload: { reason: 'Doctor visit' } });
});

test('listMyRequests builds a query string from page/pageSize/status', async () => {
  stubs.push({ method: 'GET', path: '/requests?page=2&pageSize=10&status=Approved', status: 200, body: { rows: [] } });
  await listMyRequests({ page: 2, pageSize: 10, status: 'Approved' });
  assert.equal(requests[0].path, '/requests?page=2&pageSize=10&status=Approved');
});

test('listMyRequests defaults to an empty query when called with no arguments', async () => {
  stubs.push({ method: 'GET', path: '/requests?', status: 200, body: { rows: [] } });
  await listMyRequests();
  assert.equal(requests[0].path, '/requests?');
});

test('getRequestDetail issues a GET to /requests/:id', async () => {
  stubs.push({ method: 'GET', path: '/requests/req-1', status: 200, body: { id: 'req-1' } });
  await getRequestDetail('req-1');
  assert.equal(requests[0].path, '/requests/req-1');
});

test('listApprovalQueue includes roleContext only when provided', async () => {
  stubs.push({ method: 'GET', path: '/requests/approvals?tab=pending', status: 200, body: { rows: [] } });
  await listApprovalQueue({ tab: 'pending' });
  assert.equal(requests[0].path, '/requests/approvals?tab=pending');

  stubs.push({ method: 'GET', path: '/requests/approvals?tab=decided&roleContext=pm', status: 200, body: { rows: [] } });
  await listApprovalQueue({ tab: 'decided', roleContext: 'pm' });
  assert.equal(requests[1].path, '/requests/approvals?tab=decided&roleContext=pm');
});

test('transitionRequest POSTs the transition body to /requests/:id/transitions', async () => {
  stubs.push({ method: 'POST', path: '/requests/req-1/transitions', status: 200, body: { id: 'req-1' } });
  await transitionRequest('req-1', { toState: 'Withdrawn', note: 'No longer needed' });
  assert.equal(requests[0].path, '/requests/req-1/transitions');
  assert.deepEqual(requests[0].body, { toState: 'Withdrawn', note: 'No longer needed' });
});

test('decideOnRequest POSTs the decision body to /requests/:id/decisions', async () => {
  stubs.push({ method: 'POST', path: '/requests/req-1/decisions', status: 200, body: { id: 'req-1' } });
  await decideOnRequest('req-1', { decision: 'approved' });
  assert.equal(requests[0].path, '/requests/req-1/decisions');
  assert.deepEqual(requests[0].body, { decision: 'approved' });
});

// ── Leave types & balances ────────────────────────────────────

test('listLeaveTypes issues a GET to /leave-types', async () => {
  stubs.push({ method: 'GET', path: '/leave-types', status: 200, body: [] });
  await listLeaveTypes();
  assert.equal(requests[0].path, '/leave-types');
});

test('createLeaveType POSTs the new type to /leave-types', async () => {
  stubs.push({ method: 'POST', path: '/leave-types', status: 201, body: { id: 'lt-1' } });
  await createLeaveType({ name: 'Casual', quota: 12, isPaid: true, carryForward: false, halfDayAllowed: true });
  assert.equal(requests[0].path, '/leave-types');
  assert.deepEqual(requests[0].body, {
    name: 'Casual',
    quota: 12,
    isPaid: true,
    carryForward: false,
    halfDayAllowed: true,
  });
});

test('updateLeaveType PUTs partial changes to /leave-types/:id', async () => {
  stubs.push({ method: 'PUT', path: '/leave-types/lt-1', status: 200, body: { id: 'lt-1' } });
  await updateLeaveType('lt-1', { quota: 15, carryForward: false, halfDayAllowed: true });
  assert.equal(requests[0].method, 'PUT');
  assert.equal(requests[0].path, '/leave-types/lt-1');
  assert.deepEqual(requests[0].body, { quota: 15, carryForward: false, halfDayAllowed: true });
});

test('deleteLeaveType issues a DELETE to /leave-types/:id', async () => {
  stubs.push({ method: 'DELETE', path: '/leave-types/lt-1', status: 204 });
  const result = await deleteLeaveType('lt-1');
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(result, null);
});

test('listMyLeaveBalances issues a GET to /leave-balances/me', async () => {
  stubs.push({ method: 'GET', path: '/leave-balances/me', status: 200, body: [] });
  await listMyLeaveBalances();
  assert.equal(requests[0].path, '/leave-balances/me');
});

// ── Front Desk / Item Catalog / Fulfilment ────────────────────

test('getFrontDeskToday issues a GET to /front-desk/today', async () => {
  stubs.push({ method: 'GET', path: '/front-desk/today', status: 200, body: { expected: [], onSite: [], checkedOut: [] } });
  await getFrontDeskToday();
  assert.equal(requests[0].path, '/front-desk/today');
});

test('listItemCatalog issues a GET to /item-catalog', async () => {
  stubs.push({ method: 'GET', path: '/item-catalog', status: 200, body: [] });
  await listItemCatalog();
  assert.equal(requests[0].path, '/item-catalog');
});

test('createItemCatalog POSTs the new item to /item-catalog', async () => {
  stubs.push({ method: 'POST', path: '/item-catalog', status: 201, body: { id: 'i-1' } });
  await createItemCatalog({ type: 'software', name: 'Figma' });
  assert.deepEqual(requests[0].body, { type: 'software', name: 'Figma' });
});

test('updateItemCatalog PUTs changes to /item-catalog/:id', async () => {
  stubs.push({ method: 'PUT', path: '/item-catalog/i-1', status: 200, body: { id: 'i-1' } });
  await updateItemCatalog('i-1', { archived: true });
  assert.equal(requests[0].path, '/item-catalog/i-1');
  assert.deepEqual(requests[0].body, { archived: true });
});

test('deleteItemCatalog issues a DELETE to /item-catalog/:id', async () => {
  stubs.push({ method: 'DELETE', path: '/item-catalog/i-1', status: 204 });
  await deleteItemCatalog('i-1');
  assert.equal(requests[0].method, 'DELETE');
});

test('getFulfilmentQueue issues a GET scoped to the given tab', async () => {
  stubs.push({ method: 'GET', path: '/requests/fulfilment-queue?tab=open', status: 200, body: { rows: [] } });
  await getFulfilmentQueue('open');
  assert.equal(requests[0].path, '/requests/fulfilment-queue?tab=open');
});

test('claimFulfilmentRequest POSTs to /requests/:id/claim', async () => {
  stubs.push({ method: 'POST', path: '/requests/req-1/claim', status: 200 });
  await claimFulfilmentRequest('req-1');
  assert.equal(requests[0].path, '/requests/req-1/claim');
});

// ── Absences ──────────────────────────────────────────────────

test('listAbsences includes every optional filter when provided', async () => {
  stubs.push({
    method: 'GET',
    path: '/absences?from=2026-01-01&to=2026-01-31&projectId=p-1&departmentId=d-1&type=leave&personId=u-1',
    status: 200,
    body: { rows: [] },
  });
  await listAbsences({
    from: '2026-01-01',
    to: '2026-01-31',
    projectId: 'p-1',
    departmentId: 'd-1',
    type: 'leave',
    personId: 'u-1',
  });
  assert.equal(
    requests[0].path,
    '/absences?from=2026-01-01&to=2026-01-31&projectId=p-1&departmentId=d-1&type=leave&personId=u-1',
  );
});

test('listAbsences omits optional filters when not provided', async () => {
  stubs.push({ method: 'GET', path: '/absences?from=2026-01-01&to=2026-01-31', status: 200, body: { rows: [] } });
  await listAbsences({ from: '2026-01-01', to: '2026-01-31' });
  assert.equal(requests[0].path, '/absences?from=2026-01-01&to=2026-01-31');
});

test('getOverCapDays builds its query from from/to/projectId', async () => {
  stubs.push({ method: 'GET', path: '/absences/over-cap?from=2026-01-01&to=2026-01-31&projectId=p-1', status: 200, body: { cap: 3, days: [] } });
  await getOverCapDays({ from: '2026-01-01', to: '2026-01-31', projectId: 'p-1' });
  assert.equal(requests[0].path, '/absences/over-cap?from=2026-01-01&to=2026-01-31&projectId=p-1');
});

test('getAbsenceCap issues a GET to /leave-types/absence-cap', async () => {
  stubs.push({ method: 'GET', path: '/leave-types/absence-cap', status: 200, body: { cap: 3 } });
  const result = await getAbsenceCap();
  assert.deepEqual(result, { cap: 3 });
});

test('updateAbsenceCap PUTs the new cap to /leave-types/absence-cap', async () => {
  stubs.push({ method: 'PUT', path: '/leave-types/absence-cap', status: 200, body: { cap: 5 } });
  await updateAbsenceCap({ cap: 5 });
  assert.deepEqual(requests[0].body, { cap: 5 });
});

// ── Global search ─────────────────────────────────────────────

test('globalSearch URL-encodes the query string', async () => {
  stubs.push({ method: 'GET', path: '/search?q=acme%20corp', status: 200, body: { groups: [] } });
  await globalSearch('acme corp');
  assert.equal(requests[0].path, '/search?q=acme%20corp');
});

// ── Slack integration ─────────────────────────────────────────

test('getSlackConfig issues a GET to /slack/config', async () => {
  stubs.push({ method: 'GET', path: '/slack/config', status: 200, body: { status: 'disconnected' } });
  await getSlackConfig();
  assert.equal(requests[0].path, '/slack/config');
});

test('connectSlack POSTs credentials to /slack/config/connect', async () => {
  stubs.push({ method: 'POST', path: '/slack/config/connect', status: 200, body: { status: 'connected' } });
  await connectSlack({ botToken: 'xoxb-1', signingSecret: 'sec', defaultChannel: '#general' });
  assert.deepEqual(requests[0].body, { botToken: 'xoxb-1', signingSecret: 'sec', defaultChannel: '#general' });
});

test('disconnectSlack POSTs to /slack/config/disconnect', async () => {
  stubs.push({ method: 'POST', path: '/slack/config/disconnect', status: 200, body: { status: 'disconnected' } });
  await disconnectSlack();
  assert.equal(requests[0].path, '/slack/config/disconnect');
});

test('testSlackConnection POSTs to /slack/config/test', async () => {
  stubs.push({ method: 'POST', path: '/slack/config/test', status: 204 });
  await testSlackConnection();
  assert.equal(requests[0].path, '/slack/config/test');
});

test('updateSlackSettings PUTs the settings body to /slack/config/settings', async () => {
  stubs.push({ method: 'PUT', path: '/slack/config/settings', status: 200, body: { status: 'connected' } });
  await updateSlackSettings({
    defaultChannel: '#general',
    notifyApproversOnNewRequest: true,
    notifyRequesterOnDecision: true,
    notifyRequesterOnStatusChange: true,
    digestEnabled: false,
    reminderEnabled: true,
  });
  assert.equal(requests[0].path, '/slack/config/settings');
});

// ── Notification preferences ──────────────────────────────────

test('getNotificationPreferences issues a GET to /profile/notification-preferences', async () => {
  stubs.push({ method: 'GET', path: '/profile/notification-preferences', status: 200, body: { rows: [] } });
  await getNotificationPreferences();
  assert.equal(requests[0].path, '/profile/notification-preferences');
});

test('updateNotificationPreference PUTs the type/channel/enabled body', async () => {
  stubs.push({ method: 'PUT', path: '/profile/notification-preferences', status: 200, body: { rows: [] } });
  await updateNotificationPreference({ type: 'request_approved', channel: 'inApp', enabled: false });
  assert.deepEqual(requests[0].body, { type: 'request_approved', channel: 'inApp', enabled: false });
});

// ── Reports & attendance ──────────────────────────────────────

test('getReportSummary builds its query from from/to/projectId', async () => {
  stubs.push({
    method: 'GET',
    path: '/reports/summary?from=2026-01-01&to=2026-01-31&projectId=p-1',
    status: 200,
    body: { scope: 'hr', requestVolumes: [], avgApprovalTurnaroundHours: null, absenceTrend: [] },
  });
  await getReportSummary({ from: '2026-01-01', to: '2026-01-31', projectId: 'p-1' });
  assert.equal(requests[0].path, '/reports/summary?from=2026-01-01&to=2026-01-31&projectId=p-1');
});

test('getAttendanceReport builds its query, only including optional filters when set', async () => {
  stubs.push({
    method: 'GET',
    path: '/reports/attendance?month=2026-01&page=1&pageSize=20',
    status: 200,
    body: { rows: [], total: 0 },
  });
  await getAttendanceReport({ month: '2026-01', page: 1, pageSize: 20 });
  assert.equal(requests[0].path, '/reports/attendance?month=2026-01&page=1&pageSize=20');

  stubs.push({
    method: 'GET',
    path: '/reports/attendance?month=2026-01&page=1&pageSize=20&departmentId=d-1&includeInactive=true',
    status: 200,
    body: { rows: [], total: 0 },
  });
  await getAttendanceReport({ month: '2026-01', page: 1, pageSize: 20, departmentId: 'd-1', includeInactive: true });
  assert.equal(
    requests[1].path,
    '/reports/attendance?month=2026-01&page=1&pageSize=20&departmentId=d-1&includeInactive=true',
  );
});

test('checkInWithSignature POSTs the signature/consent body to /front-desk/:id/check-in', async () => {
  stubs.push({ method: 'POST', path: '/front-desk/req-1/check-in', status: 200, body: { id: 'req-1' } });
  await checkInWithSignature('req-1', { signature: 'data:image/png;base64,abc', consent: true });
  assert.deepEqual(requests[0].body, { signature: 'data:image/png;base64,abc', consent: true });
});

test('getVisitorSignatureUrl issues a GET to /front-desk/:id/signature-url', async () => {
  stubs.push({ method: 'GET', path: '/front-desk/req-1/signature-url', status: 200, body: { url: 'https://x' } });
  const result = await getVisitorSignatureUrl('req-1');
  assert.deepEqual(result, { url: 'https://x' });
});

test('listHolidays issues a GET scoped to the given year', async () => {
  stubs.push({ method: 'GET', path: '/holidays?year=2026', status: 200, body: { rows: [] } });
  await listHolidays(2026);
  assert.equal(requests[0].path, '/holidays?year=2026');
});

test('createHoliday POSTs the date/name body to /holidays', async () => {
  stubs.push({ method: 'POST', path: '/holidays', status: 201, body: { id: 'h-1' } });
  await createHoliday({ date: '2026-01-01', name: "New Year's Day" });
  assert.deepEqual(requests[0].body, { date: '2026-01-01', name: "New Year's Day" });
});

test('updateHoliday PUTs partial changes to /holidays/:id', async () => {
  stubs.push({ method: 'PUT', path: '/holidays/h-1', status: 200, body: { id: 'h-1' } });
  await updateHoliday('h-1', { name: 'Renamed Holiday' });
  assert.deepEqual(requests[0].body, { name: 'Renamed Holiday' });
});

test('deleteHoliday issues a DELETE to /holidays/:id', async () => {
  stubs.push({ method: 'DELETE', path: '/holidays/h-1', status: 204 });
  await deleteHoliday('h-1');
  assert.equal(requests[0].method, 'DELETE');
});

// ── CSV downloads (bypass apiFetch, drive fetch + a client-side download directly) ──

test('downloadAbsencesCsv fetches the scoped export and triggers a client download', async () => {
  tokenStore.set('token-1', 'refresh-1');
  stubs.push({ method: 'GET', path: '/reports/export?from=2026-01-01&to=2026-01-31', status: 200, body: 'a,b\n1,2' });
  const realClick = HTMLAnchorElement.prototype.click;
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = () => {};
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
  try {
    await downloadAbsencesCsv({ from: '2026-01-01', to: '2026-01-31' });
  } finally {
    HTMLAnchorElement.prototype.click = realClick;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
  }
  const req = requests.find((r) => r.path.startsWith('/reports/export'));
  assert.ok(req);
  assert.equal(req.headers['authorization'], 'Bearer token-1');
});

test('downloadAbsencesCsv throws an ApiError when the export request fails', async () => {
  stubs.push({ method: 'GET', path: '/reports/export?from=2026-01-01&to=2026-01-31', status: 500 });
  await assert.rejects(
    () => downloadAbsencesCsv({ from: '2026-01-01', to: '2026-01-31' }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test('downloadAttendanceCsv fetches the monthly export and triggers a client download', async () => {
  stubs.push({ method: 'GET', path: '/reports/attendance/export?month=2026-01', status: 200, body: 'a,b\n1,2' });
  const realClick = HTMLAnchorElement.prototype.click;
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = () => {};
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
  try {
    await downloadAttendanceCsv({ month: '2026-01' });
  } finally {
    HTMLAnchorElement.prototype.click = realClick;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
  }
  assert.ok(requests.find((r) => r.path === '/reports/attendance/export?month=2026-01'));
});

test('downloadAttendanceCsv throws an ApiError when the export request fails', async () => {
  stubs.push({ method: 'GET', path: '/reports/attendance/export?month=2026-01', status: 500 });
  await assert.rejects(
    () => downloadAttendanceCsv({ month: '2026-01' }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 500);
      return true;
    },
  );
});
