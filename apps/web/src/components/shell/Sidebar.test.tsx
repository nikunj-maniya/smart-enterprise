import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { SystemRoleKey } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import { RegistrationsCountProvider } from '@/lib/registrationsCount';
import { Sidebar } from './Sidebar';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

let stubs: Stub[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    const stub = stubs.find((s) => s.method === method && s.path === path);
    if (!stub) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  cleanup();
});

const employee: AuthUser = {
  id: 'u-1',
  name: 'Emma Employee',
  email: 'emma@acme.com',
  isSystemAdmin: false,
  mustChangePassword: false,
  tenantId: 't-1',
  tenantName: 'Acme',
  roles: [SystemRoleKey.Employee],
};

const hrHead: AuthUser = { ...employee, id: 'u-2', name: 'Hana HR', roles: [SystemRoleKey.HrHead] };
const enterpriseAdmin: AuthUser = {
  ...employee,
  id: 'u-3',
  name: 'Eve Admin',
  roles: [SystemRoleKey.EnterpriseAdmin],
};
const systemAdmin: AuthUser = { ...employee, id: 'u-4', name: 'Sam System', isSystemAdmin: true, roles: [] };

function stubMe(user: AuthUser) {
  localStorage.setItem('se.accessToken', 'test-token');
  localStorage.setItem('se.refreshToken', 'test-refresh');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: user });
}

function renderSidebar(initialPath = '/requests') {
  return render(
    <AuthProvider>
      <RegistrationsCountProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Sidebar />
        </MemoryRouter>
      </RegistrationsCountProvider>
    </AuthProvider>,
  );
}

test('an employee sees the Requests section but not Platform/Organization/System', async () => {
  stubMe(employee);
  renderSidebar();
  assert.ok(await screen.findByText('My Requests'));
  assert.ok(screen.getByText('Approvals'));
  assert.equal(screen.queryByText('PLATFORM'), null);
  assert.equal(screen.queryByText('ORGANIZATION'), null);
  assert.equal(screen.queryByText('SYSTEM'), null);
});

test('an HR Head sees the Absences link and an Organization section with only Holidays', async () => {
  stubMe(hrHead);
  renderSidebar();
  assert.ok(await screen.findByText('Absences'));
  assert.ok(screen.getByText('ORGANIZATION'));
  assert.ok(screen.getByText('Holidays'));
  assert.equal(screen.queryByText('Departments'), null);
});

test('an Enterprise Admin sees the full Organization section without duplicating Absence Calendar', async () => {
  stubMe(enterpriseAdmin);
  renderSidebar();
  assert.ok(await screen.findByText('ORGANIZATION'));
  assert.ok(screen.getByText('Departments'));
  assert.ok(screen.getByText('Reports'));
  // organizationNav already carries an Absence Calendar entry — Sidebar.tsx explicitly avoids
  // adding the requests-section duplicate when the viewer is an Enterprise Admin.
  assert.equal(screen.getAllByText('Absence Calendar').length, 1);
});

test('a System Admin sees Platform + System sections, a registrations badge, and no Requests section', async () => {
  stubMe(systemAdmin);
  stubs.push({
    method: 'GET',
    path: '/registrations?status=Pending&pageSize=1',
    status: 200,
    body: { rows: [], total: 5, page: 1, pageSize: 1 },
  });
  renderSidebar();
  assert.ok(await screen.findByText('PLATFORM'));
  assert.ok(screen.getByText('SYSTEM'));
  assert.ok(screen.getByText('Settings'));
  assert.equal(screen.queryByText('My Requests'), null);
  assert.ok(await screen.findByText('5'));
});

test('highlights the active route via NavLink aria-current', async () => {
  stubMe(employee);
  renderSidebar('/requests/approvals');
  await screen.findByText('My Requests');
  const activeLink = screen.getByText('Approvals').closest('a');
  const inactiveLink = screen.getByText('My Requests').closest('a');
  assert.equal(activeLink?.getAttribute('aria-current'), 'page');
  assert.equal(inactiveLink?.getAttribute('aria-current'), null);
});

test('logging out clears the session and reverts the user footer to signed-out state', async () => {
  stubMe(enterpriseAdmin);
  renderSidebar();
  assert.ok(await screen.findByText('Eve Admin'));
  assert.equal(screen.getByText('Enterprise Admin', { selector: 'div' }).textContent, 'Enterprise Admin');
  fireEvent.click(screen.getByLabelText('Log out'));
  assert.equal(screen.queryByText('Eve Admin'), null);
  assert.equal(localStorage.getItem('se.accessToken'), null);
});
