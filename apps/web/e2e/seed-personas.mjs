/**
 * Seeds the e2e personas into the ISOLATED test stack through the app's real flows
 * (registration → sysadmin acceptance → admin-created users → project). Idempotent —
 * safe to re-run. See README.md in this directory for the full runbook.
 *
 *   node e2e/seed-personas.mjs
 *
 * Assumes the test API is up (E2E_API_URL, default http://localhost:4001) and was
 * started with SYSTEM_ADMIN_EMAIL=sysadmin@e2e.test / SYSTEM_ADMIN_PASSWORD (below).
 *
 * Auth here mirrors the real browser session (httpOnly access/refresh cookies + a
 * double-submit `se_csrf` cookie/header on mutating requests) instead of a Bearer token,
 * so this script exercises the same auth path the app itself uses — no separate
 * token-in-response-body path exists just for tooling.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:4001';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD ?? 'E2eSys@123';
const INIT = 'Init@12345';
const FINAL = process.env.E2E_PERSONA_PASSWORD ?? 'E2ePass@123';

function newSession() {
  return { cookies: new Map() };
}

/** Parses `Set-Cookie` response headers into `[name, value]` pairs, ignoring attributes. */
function parseSetCookie(res) {
  return (res.headers.getSetCookie?.() ?? []).map((line) => {
    const pair = line.split(';', 1)[0];
    const idx = pair.indexOf('=');
    return [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
  });
}

async function call(method, path, { session, body, okStatuses = [200, 201] } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (session?.cookies.size) {
    headers.cookie = [...session.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  // Mutating requests riding the session's auth cookies need the matching CSRF header — same
  // double-submit check a real browser session goes through (middleware/csrf.ts).
  if (session?.cookies.has('se_csrf') && !['GET', 'HEAD'].includes(method)) {
    headers['x-csrf-token'] = session.cookies.get('se_csrf');
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (session) {
    for (const [name, value] of parseSetCookie(res)) session.cookies.set(name, value);
  }
  const text = await res.text();
  if (!okStatuses.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function login(email, password) {
  const session = newSession();
  const r = await call('POST', '/auth/login', { session, body: { email, password } });
  return { session, user: r.user };
}

/** Login; if forced, change password to FINAL via the real endpoint and return a fresh session. */
async function activate(email, initialPassword) {
  let s;
  try {
    s = await login(email, initialPassword);
  } catch {
    s = await login(email, FINAL); // already activated on a previous run
  }
  if (s.user.mustChangePassword) {
    await call('POST', '/auth/change-password', {
      session: s.session,
      body: { currentPassword: initialPassword, newPassword: FINAL },
    });
    s = await login(email, FINAL);
  }
  return s;
}

// 1. Public registration → tenant + admin persona. Submitting again for an already-registered
// email now resolves the same way as a fresh submission (enumeration-safe, security audit
// finding #3), so this can't branch on the submit response anymore — idempotency instead comes
// from checking what's actually still pending below.
await call('POST', '/registrations', {
  body: {
    companyName: 'E2E Test Co',
    industry: 'Technology',
    size: '11-50',
    contactName: 'E2E Admin',
    contactEmail: 'admin@e2e.test',
    password: INIT,
  },
});

// 2. System admin accepts, if there's still a pending registration for this email
const sys = await activate('sysadmin@e2e.test', SYSADMIN_PASSWORD);
const pending = await call('GET', '/registrations?status=Pending&search=admin@e2e.test&pageSize=10', {
  session: sys.session,
});
const pendingMatch = (pending.rows ?? pending).find((r) => r.contactEmail === 'admin@e2e.test');
if (pendingMatch) {
  await call('POST', `/registrations/${pendingMatch.id}/accept`, { session: sys.session, body: {} });
  console.log('registration accepted:', pendingMatch.id);
} else {
  console.log('registration already accepted — continuing');
}

// 3. Admin activates (change forced password if any)
const admin = await activate('admin@e2e.test', INIT);
console.log('admin active:', admin.user.roles.join(','));

// 4. Map role keys → ids, grab a department
const roles = await call('GET', '/roles?pageSize=100', { session: admin.session });
const roleRows = roles.rows ?? roles;
const roleId = (name) => {
  const row = roleRows.find((r) => r.name === name);
  if (!row) throw new Error(`role not found: ${name} (have: ${roleRows.map((r) => r.name).join(',')})`);
  return row.id;
};
const deps = await call('GET', '/departments?pageSize=100', { session: admin.session });
const depId = (deps.rows ?? deps)[0].id;

// 5. Create personas through org-users (the real admin flow)
const PERSONAS = [
  ['E2E Finance', 'finance@e2e.test', ['Finance', 'Employee']],
  ['E2E HR Head', 'hr@e2e.test', ['HR Head', 'Employee']],
  ['E2E Employee', 'employee@e2e.test', ['Employee']],
  ['E2E Project Manager', 'pm@e2e.test', ['Project Manager', 'Employee']],
  ['E2E Tech Lead', 'tl@e2e.test', ['Tech Lead', 'Employee']],
];
const existingUsers = await call('GET', '/org-users?pageSize=100', { session: admin.session });
const existingByEmail = new Map((existingUsers.rows ?? existingUsers).map((u) => [u.email, u]));

const ids = {};
for (const [name, email, keys] of PERSONAS) {
  const found = existingByEmail.get(email);
  if (found) {
    ids[email] = found.id;
  } else {
    const u = await call('POST', '/org-users', {
      session: admin.session,
      body: { name, email, password: INIT, roleIds: keys.map(roleId), departmentIds: [depId] },
    });
    ids[email] = u.id;
  }
  await activate(email, INIT);
  console.log('persona ready:', email, `(${keys.join('+')})`);
}

// 6. Project with PM + TL so the leave-form fixture resolves (skip when it already exists)
const projects = await call('GET', '/projects?pageSize=100', { session: admin.session });
if (!(projects.rows ?? projects).some((p) => p.name === 'E2E Delivery')) {
  await call('POST', '/projects', {
    session: admin.session,
    body: {
      name: 'E2E Delivery',
      status: 'active',
      pmUserId: ids['pm@e2e.test'],
      techLeadUserId: ids['tl@e2e.test'],
      memberIds: [ids['employee@e2e.test']],
    },
  });
  console.log('project created: E2E Delivery');
} else {
  console.log('project already exists: E2E Delivery');
}
console.log('DONE');
