import type { APIRequestContext } from '@playwright/test';
import type { Credentials } from './helpers';

/**
 * API-level fixture helpers: e2e journeys ARRANGE through the real backend
 * (create + approve a request the way the app itself would) and ASSERT through
 * the UI. Nothing here touches the database directly.
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export async function apiLogin(request: APIRequestContext, creds: Credentials): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) throw new Error(`login failed for ${creds.email}: ${res.status()}`);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function getJson<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
 * Employee submits a 2-weekday LWP leave through the real request API; HR Head
 * moves it to Approved via the status-model transition the UI exposes. Returns
 * null (test should skip) when the tenant lacks the fixtures the leave form
 * requires (a department, a project, a project manager).
 */
export async function createApprovedLwpLeave(
  request: APIRequestContext,
  employee: Credentials,
  hr: Credentials,
): Promise<ApprovedLeave | null> {
  const span = nextTwoWeekdaySpan();
  if (!span) return null;

  const employeeToken = await apiLogin(request, employee);
  const departments = await getJson<{ rows: { id: string; name: string }[] }>(
    request,
    employeeToken,
    '/departments?pageSize=100',
  );
  const projects = await getJson<{ rows: { id: string; name: string }[] }>(
    request,
    employeeToken,
    '/directory/projects',
  );
  const pms = await getJson<{ rows: { id: string; name: string }[] }>(
    request,
    employeeToken,
    '/directory/users?roles=project-manager&limit=5',
  );
  const tls = await getJson<{ rows: { id: string; name: string }[] }>(
    request,
    employeeToken,
    '/directory/users?roles=tech-lead&limit=5',
  );
  if (!departments.rows.length || !projects.rows.length || !pms.rows.length) return null;

  const created = await request.post(`${API_URL}/requests`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
    data: {
      formKey: 'leave',
      payload: {
        full_name: employee.email,
        department: departments.rows[0].id,
        project_name: [projects.rows[0].id],
        project_manager: [pms.rows[0].id],
        tech_lead: [tls.rows.length ? tls.rows[0].id : pms.rows[0].id],
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

  const hrToken = await apiLogin(request, hr);
  const approved = await request.post(`${API_URL}/requests/${dto.id}/transitions`, {
    headers: { Authorization: `Bearer ${hrToken}` },
    data: { toState: 'Approved', note: 'E2E fixture approval' },
  });
  if (!approved.ok())
    throw new Error(`approval transition failed: ${approved.status()} ${await approved.text()}`);

  return { requestId: dto.id, start: span.start, end: span.end };
}

/** Cleanup: HR cancels the approved fixture leave so the tenant's report returns to its prior state. */
export async function cancelRequest(
  request: APIRequestContext,
  hr: Credentials,
  requestId: string,
): Promise<void> {
  const hrToken = await apiLogin(request, hr);
  await request.post(`${API_URL}/requests/${requestId}/transitions`, {
    headers: { Authorization: `Bearer ${hrToken}` },
    data: { toState: 'Cancelled', note: 'E2E fixture cleanup' },
  });
}

/** Fetches the attendance CSV via the API (arrange/baseline reads; the journey's final read goes through the UI). */
export async function fetchAttendanceCsv(
  request: APIRequestContext,
  finance: Credentials,
  month: string,
): Promise<string> {
  const token = await apiLogin(request, finance);
  const res = await request.get(`${API_URL}/reports/attendance/export?month=${month}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`csv export failed: ${res.status()}`);
  return res.text();
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
