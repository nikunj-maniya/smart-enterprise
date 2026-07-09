import type {
  ApprovalQueueResponse,
  ApprovalQueueTab,
  DirectoryProjectsResponse,
  DirectoryUsersResponse,
  FormDefinitionDto,
  FormDefinitionSummaryDto,
  MyRequestsResponse,
  RequestDto,
  TransitionRequestInput,
} from '@se/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const ACCESS_KEY = 'se.accessToken';
const REFRESH_KEY = 'se.refreshToken';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Per-field error map from a 400 validation failure (e.g. `POST /requests`), if present. */
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokenStore.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message = (data && (data.error as string)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data?.details);
  }
  return data as T;
}

/**
 * Directory search backing `user-picker`/`project-picker` fields (PRD §6.3) — the
 * capped, tenant-scoped lookups the core renderer's pickers call as the user types.
 */
export function searchDirectoryUsers(query: {
  search?: string;
  roles?: string[];
  departments?: string[];
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.roles?.length) params.set('roles', query.roles.join(','));
  if (query.departments?.length) params.set('departments', query.departments.join(','));
  if (query.limit) params.set('limit', String(query.limit));
  return apiFetch<DirectoryUsersResponse>(`/directory/users?${params.toString()}`);
}

export function searchDirectoryProjects(query: { search?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.limit) params.set('limit', String(query.limit));
  return apiFetch<DirectoryProjectsResponse>(`/directory/projects?${params.toString()}`);
}

/** `GET /forms` — the tenant's published forms (latest version per key) for the employee New Request list. */
export function listPublishedForms() {
  return apiFetch<FormDefinitionSummaryDto[]>('/forms');
}

/** `GET /forms/:key` — the tenant's latest published definition for a form key, for the generic renderer. */
export function getPublishedForm(key: string) {
  return apiFetch<FormDefinitionDto>(`/forms/${key}`);
}

/** `POST /requests` — submit a request against a published form's pinned version. On a 400, `ApiError.details` carries the per-field error map to feed back into the renderer. */
export function submitRequest(formKey: string, payload: Record<string, unknown>) {
  return apiFetch<RequestDto>('/requests', {
    method: 'POST',
    body: JSON.stringify({ formKey, payload }),
  });
}

/** `GET /requests` — the caller's own submitted requests (My Requests), newest first. */
export function listMyRequests(query: { page?: number; pageSize?: number; status?: string } = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.status) params.set('status', query.status);
  return apiFetch<MyRequestsResponse>(`/requests?${params.toString()}`);
}

/** `GET /requests/approvals` — the caller's approver queue, tabbed by their own decision. */
export function listApprovalQueue(query: { tab: ApprovalQueueTab; roleContext?: string }) {
  const params = new URLSearchParams({ tab: query.tab });
  if (query.roleContext) params.set('roleContext', query.roleContext);
  return apiFetch<ApprovalQueueResponse>(`/requests/approvals?${params.toString()}`);
}

/** `POST /requests/:id/transitions` — move a request along a status-model transition (approve, reject, withdraw, …). */
export function transitionRequest(requestId: string, body: TransitionRequestInput) {
  return apiFetch<RequestDto>(`/requests/${requestId}/transitions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
