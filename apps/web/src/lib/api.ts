import type {
  AbsenceCapDto,
  AbsenceQuery,
  AbsenceRangeResponse,
  ApprovalQueueResponse,
  ApprovalQueueTab,
  AttendanceReportQuery,
  AttendanceReportResponse,
  CheckInWithSignatureRequest,
  CreateItemCatalogRequest,
  CreateLeaveTypeRequest,
  DecisionRequestInput,
  DirectoryProjectsResponse,
  DirectoryUsersResponse,
  FormDefinitionDto,
  FormDefinitionSummaryDto,
  FrontDeskTodayResponse,
  FulfilmentQueueResponse,
  FulfilmentQueueTab,
  GlobalSearchResponse,
  HolidayCreate,
  HolidayDto,
  HolidayUpdate,
  ItemCatalogDto,
  LeaveBalanceDto,
  LeaveTypeDto,
  MyRequestsResponse,
  NotificationPreferencesResponse,
  OverCapQuery,
  OverCapResponse,
  ConnectSlackRequest,
  ReportRangeQuery,
  ReportSummaryResponse,
  RequestDetailDto,
  RequestDto,
  SignedUrlResponse,
  SlackConfigDto,
  TransitionRequestInput,
  UpdateAbsenceCapRequest,
  UpdateItemCatalogRequest,
  UpdateLeaveTypeRequest,
  UpdateNotificationPreferenceRequest,
  UpdateSlackSettingsRequest,
} from '@se/shared';

const API_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000';

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

/** `GET /requests/:id` — one of the caller's own requests, rendered against its own pinned form definition version. */
export function getRequestDetail(requestId: string) {
  return apiFetch<RequestDetailDto>(`/requests/${requestId}`);
}

/** `GET /requests/approvals` — the caller's approver queue, tabbed by their own decision. */
export function listApprovalQueue(query: { tab: ApprovalQueueTab; roleContext?: string }) {
  const params = new URLSearchParams({ tab: query.tab });
  if (query.roleContext) params.set('roleContext', query.roleContext);
  return apiFetch<ApprovalQueueResponse>(`/requests/approvals?${params.toString()}`);
}

/** `POST /requests/:id/transitions` — move a request along a status-model transition (withdraw, cancel, …). Not for Approve/Reject — use `decideOnRequest`. */
export function transitionRequest(requestId: string, body: TransitionRequestInput) {
  return apiFetch<RequestDto>(`/requests/${requestId}/transitions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `POST /requests/:id/decisions` — record the caller's own Approve/Reject as a snapshotted approver. */
export function decideOnRequest(requestId: string, body: DecisionRequestInput) {
  return apiFetch<RequestDto>(`/requests/${requestId}/decisions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `GET /leave-types` (Enterprise Admin only) — the tenant's configured leave types (Leave Policy & Quotas page). */
export function listLeaveTypes() {
  return apiFetch<LeaveTypeDto[]>('/leave-types');
}

/** `POST /leave-types` (Enterprise Admin only) — add a leave type; refused (409) if the name is already taken. Opens balances for the tenant's active users when paid. */
export function createLeaveType(body: CreateLeaveTypeRequest) {
  return apiFetch<LeaveTypeDto>('/leave-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `PUT /leave-types/:id` (Enterprise Admin only) — update a leave type's name/paid flag and quota/carry-forward/half-day policy. */
export function updateLeaveType(id: string, body: UpdateLeaveTypeRequest) {
  return apiFetch<LeaveTypeDto>(`/leave-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** `DELETE /leave-types/:id` (Enterprise Admin only) — refused (409) while requests reference the type or balances show consumption. */
export function deleteLeaveType(id: string) {
  return apiFetch<void>(`/leave-types/${id}`, { method: 'DELETE' });
}

/** `GET /leave-balances/me` — the caller's own paid leave-type balances (My Requests balance cards). */
export function listMyLeaveBalances() {
  return apiFetch<LeaveBalanceDto[]>('/leave-balances/me');
}

/** `GET /front-desk/today` (Enterprise Admin / HR Head only) — today's visitors, split by lifecycle bucket. */
export function getFrontDeskToday() {
  return apiFetch<FrontDeskTodayResponse>('/front-desk/today');
}

/** `GET /item-catalog` (Enterprise Admin only) — the tenant's software + hardware catalogs, including archived items. */
export function listItemCatalog() {
  return apiFetch<ItemCatalogDto[]>('/item-catalog');
}

/** `POST /item-catalog` (Enterprise Admin only) — add a new catalog item. */
export function createItemCatalog(body: CreateItemCatalogRequest) {
  return apiFetch<ItemCatalogDto>('/item-catalog', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `PUT /item-catalog/:id` (Enterprise Admin only) — rename and/or archive/unarchive an item. */
export function updateItemCatalog(id: string, body: UpdateItemCatalogRequest) {
  return apiFetch<ItemCatalogDto>(`/item-catalog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** `DELETE /item-catalog/:id` (Enterprise Admin only) — refused (409) if any request has ever named this item. */
export function deleteItemCatalog(id: string) {
  return apiFetch<void>(`/item-catalog/${id}`, { method: 'DELETE' });
}

/** `GET /requests/fulfilment-queue` (IT Admin only) — the IT fulfilment queue, tabbed open/fulfilled. */
export function getFulfilmentQueue(tab: FulfilmentQueueTab) {
  return apiFetch<FulfilmentQueueResponse>(`/requests/fulfilment-queue?tab=${tab}`);
}

/** `POST /requests/:id/claim` (IT Admin only) — claim a queued request for fulfilment. */
export function claimFulfilmentRequest(requestId: string) {
  return apiFetch<void>(`/requests/${requestId}/claim`, { method: 'POST' });
}

/** `GET /absences` (HR Head / Enterprise Admin / PM / Tech Lead) — approved Leave/WFH absences
 *  overlapping the given range, scoped and field-shaped per the caller's §11A visibility tier. */
export function listAbsences(query: AbsenceQuery) {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.type) params.set('type', query.type);
  if (query.personId) params.set('personId', query.personId);
  return apiFetch<AbsenceRangeResponse>(`/absences?${params.toString()}`);
}

/** `GET /absences/over-cap` (HR Head / Enterprise Admin only) — days in range whose concurrent
 *  absence count exceeds the tenant's configured cap. */
export function getOverCapDays(query: OverCapQuery) {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  if (query.projectId) params.set('projectId', query.projectId);
  return apiFetch<OverCapResponse>(`/absences/over-cap?${params.toString()}`);
}

/** `GET /leave-types/absence-cap` (Enterprise Admin only) — the tenant's concurrent-absence cap. */
export function getAbsenceCap() {
  return apiFetch<AbsenceCapDto>('/leave-types/absence-cap');
}

/** `PUT /leave-types/absence-cap` (Enterprise Admin only) — update the cap. */
export function updateAbsenceCap(body: UpdateAbsenceCapRequest) {
  return apiFetch<AbsenceCapDto>('/leave-types/absence-cap', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** `GET /search` — role- and tenant-scoped global search, grouped by entity type. */
export function globalSearch(q: string) {
  return apiFetch<GlobalSearchResponse>(`/search?q=${encodeURIComponent(q)}`);
}

/** `GET /slack/config` (Enterprise Admin only) — the tenant's Slack integration status and settings. */
export function getSlackConfig() {
  return apiFetch<SlackConfigDto>('/slack/config');
}

/** `POST /slack/config/connect` (Enterprise Admin only) — verify credentials with Slack and connect. */
export function connectSlack(body: ConnectSlackRequest) {
  return apiFetch<SlackConfigDto>('/slack/config/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `POST /slack/config/disconnect` (Enterprise Admin only) — disconnect the tenant's Slack workspace. */
export function disconnectSlack() {
  return apiFetch<SlackConfigDto>('/slack/config/disconnect', { method: 'POST' });
}

/** `POST /slack/config/test` (Enterprise Admin only) — send a test message to confirm the connection works. */
export function testSlackConnection() {
  return apiFetch<void>('/slack/config/test', { method: 'POST' });
}

/** `PUT /slack/config/settings` (Enterprise Admin only) — update notification toggles and digest config. */
export function updateSlackSettings(body: UpdateSlackSettingsRequest) {
  return apiFetch<SlackConfigDto>('/slack/config/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** `GET /profile/notification-preferences` — every notification type, merged with the caller's own overrides. */
export function getNotificationPreferences() {
  return apiFetch<NotificationPreferencesResponse>('/profile/notification-preferences');
}

/** `PUT /profile/notification-preferences` — toggle one type/channel; refused for mandatory types. */
export function updateNotificationPreference(body: UpdateNotificationPreferenceRequest) {
  return apiFetch<NotificationPreferencesResponse>('/profile/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** `GET /reports/summary` — request volumes, approval turnaround, and absence trend, scoped by the caller's §11A tier. */
export function getReportSummary(query: ReportRangeQuery) {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.projectId) params.set('projectId', query.projectId);
  return apiFetch<ReportSummaryResponse>(`/reports/summary?${params.toString()}`);
}

/** `GET /reports/export` — downloads the visibility-scoped absence CSV for the given range. */
export async function downloadAbsencesCsv(query: ReportRangeQuery): Promise<void> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.projectId) params.set('projectId', query.projectId);
  const token = tokenStore.access;
  const res = await fetch(`${API_URL}/reports/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `absences-${query.from}-to-${query.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** `POST /front-desk/:requestId/check-in` — captures the visitor's signature and drives Approved → Checked-In. */
export function checkInWithSignature(requestId: string, body: CheckInWithSignatureRequest) {
  return apiFetch<RequestDto>(`/front-desk/${requestId}/check-in`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `GET /front-desk/:requestId/signature-url` — a fresh, short-lived signed URL to the stored signature. */
export function getVisitorSignatureUrl(requestId: string) {
  return apiFetch<SignedUrlResponse>(`/front-desk/${requestId}/signature-url`);
}

/** `GET /holidays` (any tenant user) — the tenant's company holidays for a calendar year, sorted by date. */
export function listHolidays(year: number) {
  return apiFetch<{ rows: HolidayDto[] }>(`/holidays?year=${year}`);
}

/** `POST /holidays` — add a company holiday; refused (409) if one already exists on that date. */
export function createHoliday(input: HolidayCreate) {
  return apiFetch<HolidayDto>('/holidays', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** `PUT /holidays/:id` — rename and/or move a holiday; refused (409) if the new date is already taken. */
export function updateHoliday(id: string, input: HolidayUpdate) {
  return apiFetch<HolidayDto>(`/holidays/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** `DELETE /holidays/:id` — remove a holiday. */
export function deleteHoliday(id: string) {
  return apiFetch<void>(`/holidays/${id}`, { method: 'DELETE' });
}

/** `GET /reports/attendance` (Finance / Enterprise Admin) — per-employee payable-day figures for a month. */
export function getAttendanceReport(query: AttendanceReportQuery) {
  const params = new URLSearchParams({
    month: query.month,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.includeInactive) params.set('includeInactive', 'true');
  return apiFetch<AttendanceReportResponse>(`/reports/attendance?${params.toString()}`);
}

/** `GET /reports/attendance/export` — downloads the full (unpaginated) attendance report as a CSV. */
export async function downloadAttendanceCsv(
  query: Omit<AttendanceReportQuery, 'page' | 'pageSize'>,
): Promise<void> {
  const params = new URLSearchParams({ month: query.month });
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.includeInactive) params.set('includeInactive', 'true');
  const token = tokenStore.access;
  const res = await fetch(`${API_URL}/reports/attendance/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${query.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
