import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import type { Credentials } from './helpers';

/**
 * API-level fixture helpers: e2e journeys ARRANGE through the real backend
 * (create + approve a request the way the app itself would) and ASSERT through
 * the UI. Nothing here touches the database directly.
 *
 * Auth mirrors the real browser session (httpOnly access/refresh cookies + a
 * double-submit `se_csrf` cookie/header on mutating requests) rather than a Bearer
 * token — each persona gets its own isolated `APIRequestContext` ("session") via
 * `playwrightRequest.newContext()` so concurrent identities don't share cookies.
 * The `request` fixture parameter each exported function still takes is unused
 * now (kept only so call sites don't need to change) — every real call goes
 * through a session created by `apiLogin`.
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export async function apiLogin(_request: APIRequestContext, creds: Credentials): Promise<APIRequestContext> {
  const session = await playwrightRequest.newContext();
  const res = await session.post(`${API_URL}/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) throw new Error(`login failed for ${creds.email}: ${res.status()}`);
  return session;
}

/** Reads the session's own `se_csrf` cookie back out for mutating requests (GET/HEAD don't need it). */
async function csrfHeaders(session: APIRequestContext): Promise<Record<string, string>> {
  const { cookies } = await session.storageState();
  const csrf = cookies.find((c) => c.name === 'se_csrf');
  return csrf ? { 'x-csrf-token': csrf.value } : {};
}

async function getJson<T>(session: APIRequestContext, path: string): Promise<T> {
  const res = await session.get(`${API_URL}${path}`);
  if (!res.ok()) throw new Error(`GET ${path} failed: ${res.status()}`);
  return (await res.json()) as T;
}

/** First span of two consecutive weekdays in the current month starting tomorrow or later; null when the month is out of room. */
export function nextTwoWeekdaySpan(): { start: string; end: string } | null {
  const now = new Date();
  for (let offset = 1; ; offset++) {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
    );
    if (start.getUTCMonth() !== now.getUTCMonth()) return null;
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1),
    );
    const weekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
    if (weekday(start) && weekday(end) && end.getUTCMonth() === now.getUTCMonth()) {
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
  }
}

export interface ApprovedLeave {
  requestId: string;
  start: string;
  end: string;
}

/**
 * Employee submits a 2-weekday LWP leave through the real request API; the PM and
 * Tech Lead named on the request approve it through the decision endpoint — the
 * same flow the app itself enforces (parallel approval, snapshotted approvers).
 * Returns null (test should skip) when the tenant lacks the fixtures the leave
 * form requires (a department, a project, the PM/TL personas in the directory).
 */
export async function createApprovedLwpLeave(
  _request: APIRequestContext,
  employee: Credentials,
  pm: Credentials,
  tl: Credentials,
): Promise<ApprovedLeave | null> {
  const span = nextTwoWeekdaySpan();
  if (!span) return null;

  const employeeSession = await apiLogin(_request, employee);
  try {
    // Department reads are role-gated (admin/HR/PM/TL) — the employee's own form gets its
    // options from the compiled form metadata, so the fixture looks the ids up as the PM instead.
    const pmLookupSession = await apiLogin(_request, pm);
    let departments: { rows: { id: string; name: string }[] };
    try {
      departments = await getJson(pmLookupSession, '/departments?pageSize=100');
    } finally {
      await pmLookupSession.dispose();
    }
    const projects = await getJson<{ rows: { id: string; name: string }[] }>(
      employeeSession,
      '/directory/projects',
    );
    const pms = await getJson<{ rows: { id: string; name: string; email: string }[] }>(
      employeeSession,
      '/directory/users?roles=project-manager&limit=50',
    );
    const tls = await getJson<{ rows: { id: string; name: string; email: string }[] }>(
      employeeSession,
      '/directory/users?roles=tech-lead&limit=50',
    );
    // The approvers must be the credentialed personas — they decide the request below.
    const pmRow = pms.rows.find((u) => u.email === pm.email);
    const tlRow = tls.rows.find((u) => u.email === tl.email);
    if (!departments.rows.length || !projects.rows.length || !pmRow || !tlRow) return null;

    const created = await employeeSession.post(`${API_URL}/requests`, {
      headers: await csrfHeaders(employeeSession),
      data: {
        formKey: 'leave',
        payload: {
          full_name: employee.email,
          department: departments.rows[0].id,
          project_name: [projects.rows[0].id],
          project_manager: [pmRow.id],
          tech_lead: [tlRow.id],
          away_duration: '≤2 days',
          number_of_days: 2,
          when_go: 'Later',
          start_date: span.start,
          end_date: span.end,
          leave_type: 'LWP',
          context: 'E2E payroll-math fixture — safe to cancel.',
        },
      },
    });
    if (!created.ok())
      throw new Error(`request creation failed: ${created.status()} ${await created.text()}`);
    const dto = (await created.json()) as { id: string };

    // Parallel approval: both snapshotted approvers (PM + TL) decide via the decision endpoint.
    for (const approver of [pm, tl]) {
      const approverSession = await apiLogin(_request, approver);
      try {
        const decided = await approverSession.post(`${API_URL}/requests/${dto.id}/decisions`, {
          headers: await csrfHeaders(approverSession),
          data: { decision: 'approved', comment: 'E2E fixture approval' },
        });
        if (!decided.ok())
          throw new Error(
            `approval decision by ${approver.email} failed: ${decided.status()} ${await decided.text()}`,
          );
      } finally {
        await approverSession.dispose();
      }
    }

    return { requestId: dto.id, start: span.start, end: span.end };
  } finally {
    await employeeSession.dispose();
  }
}

/** Cleanup: HR cancels the approved fixture leave so the tenant's report returns to its prior state. */
export async function cancelRequest(
  _request: APIRequestContext,
  hr: Credentials,
  requestId: string,
): Promise<void> {
  const hrSession = await apiLogin(_request, hr);
  try {
    await hrSession.post(`${API_URL}/requests/${requestId}/transitions`, {
      headers: await csrfHeaders(hrSession),
      data: { toState: 'Cancelled', note: 'E2E fixture cleanup' },
    });
  } finally {
    await hrSession.dispose();
  }
}

/** Fetches the attendance CSV via the API (arrange/baseline reads; the journey's final read goes through the UI). */
export async function fetchAttendanceCsv(
  _request: APIRequestContext,
  finance: Credentials,
  month: string,
): Promise<string> {
  const session = await apiLogin(_request, finance);
  try {
    const res = await session.get(`${API_URL}/reports/attendance/export?month=${month}`);
    if (!res.ok()) throw new Error(`csv export failed: ${res.status()}`);
    return res.text();
  } finally {
    await session.dispose();
  }
}

/** Minimal RFC-4180 line splitter (quotes + escaped quotes) — enough for the export's own output. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** Returns the named columns of the CSV row whose Email cell matches, or null. */
export function csvRowByEmail(csv: string, email: string): Record<string, string> | null {
  const [headerLine, ...lines] = csv.trim().split('\n');
  const headers = splitCsvLine(headerLine);
  const emailIdx = headers.indexOf('Email');
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells[emailIdx] === email) {
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    }
  }
  return null;
}
