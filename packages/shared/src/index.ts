import { z } from 'zod';
import {
  collectRuleFields,
  formFieldSchema,
  stageRulesSchema,
  statusModelSchema,
} from './form-engine/index.js';

export * from './form-engine/index.js';

/** Health-check response shared between API and web. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Enterprise (tenant) lifecycle — PRD §5.1. */
export const tenantStatus = z.enum(['Pending', 'Active', 'Suspended', 'Rejected']);
export type TenantStatus = z.infer<typeof tenantStatus>;

/** User account status. */
export const userStatus = z.enum(['Pending', 'Active', 'Inactive', 'Suspended']);
export type UserStatus = z.infer<typeof userStatus>;

// ── Org masters (roles & departments) — PRD §4.2-§4.3 ─────────
/** Seeded, undeletable System roles created at tenant activation (design.md decision). */
export const SystemRoleKey = {
  Employee: 'employee',
  ProjectManager: 'project-manager',
  TechLead: 'tech-lead',
  HrHead: 'hr-head',
  ProcessHead: 'process-head',
  ItAdmin: 'it-admin',
  EnterpriseAdmin: 'enterprise-admin',
  Finance: 'finance',
} as const;
export type SystemRoleKey = (typeof SystemRoleKey)[keyof typeof SystemRoleKey];
export const SYSTEM_ROLE_KEYS: SystemRoleKey[] = Object.values(SystemRoleKey);

export const SYSTEM_ROLE_NAMES: Record<SystemRoleKey, string> = {
  [SystemRoleKey.Employee]: 'Employee',
  [SystemRoleKey.ProjectManager]: 'Project Manager',
  [SystemRoleKey.TechLead]: 'Tech Lead',
  [SystemRoleKey.HrHead]: 'HR Head',
  [SystemRoleKey.ProcessHead]: 'Process Head',
  [SystemRoleKey.ItAdmin]: 'IT Admin',
  [SystemRoleKey.EnterpriseAdmin]: 'Enterprise Admin',
  [SystemRoleKey.Finance]: 'Finance',
};

/** Seed departments created at tenant activation — PRD §4.3. */
export const DEFAULT_DEPARTMENT_NAMES = [
  'IOT',
  'Developer',
  'HR',
  'Admin & Management',
  'Sales & Marketing',
  'Other',
] as const;

/**
 * Fixed permission catalog — PRD §4.4. Roles are bundles that store a subset of
 * these keys (design.md decision). Custom permission *types* need engineering;
 * custom bundles don't. Grouped for the role-editor UI.
 */
export const PermissionKey = {
  ViewAllForms: 'view_all_forms',
  SubmitRequest: 'submit_request',
  ApproveAssigned: 'approve_assigned',
  ApproveLeaveOver2Days: 'approve_leave_over_2_days',
  ApproveVisitor: 'approve_visitor',
  FulfilItRequest: 'fulfil_it_request',
  CheckVisitor: 'check_visitor',
  ManageLeaveQuotas: 'manage_leave_quotas',
  ConfigureForms: 'configure_forms',
  ManageOrg: 'manage_org',
  ManageHolidays: 'manage_holidays',
  ViewAttendanceReport: 'view_attendance_report',
} as const;
export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

export interface PermissionGroup {
  group: string;
  permissions: { key: PermissionKey; label: string }[];
}

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    group: 'General',
    permissions: [
      { key: PermissionKey.ViewAllForms, label: 'View all form types' },
      { key: PermissionKey.SubmitRequest, label: 'Submit a request' },
    ],
  },
  {
    group: 'Approvals',
    permissions: [
      { key: PermissionKey.ApproveAssigned, label: 'Approve where assigned' },
      { key: PermissionKey.ApproveLeaveOver2Days, label: 'Approve leave / WFH over 2 days' },
      { key: PermissionKey.ApproveVisitor, label: 'Approve visitor gadgets / entry' },
      { key: PermissionKey.FulfilItRequest, label: 'Fulfil IT requests' },
      { key: PermissionKey.CheckVisitor, label: 'Check visitors in / out' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { key: PermissionKey.ManageLeaveQuotas, label: 'Manage leave quotas' },
      { key: PermissionKey.ConfigureForms, label: 'Configure forms / routing' },
      { key: PermissionKey.ManageOrg, label: 'Manage users, roles & departments' },
      { key: PermissionKey.ManageHolidays, label: 'Manage company holidays' },
      { key: PermissionKey.ViewAttendanceReport, label: 'View attendance report' },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_CATALOG.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export const PERMISSION_LABELS: Record<PermissionKey, string> = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => [p.key, p.label])),
) as Record<PermissionKey, string>;

/** Default permission set seeded onto each System role — the PRD §4.4 matrix. */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  [SystemRoleKey.Employee]: [PermissionKey.ViewAllForms, PermissionKey.SubmitRequest],
  [SystemRoleKey.ProjectManager]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.ApproveAssigned,
  ],
  [SystemRoleKey.TechLead]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.ApproveAssigned,
  ],
  [SystemRoleKey.HrHead]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.ApproveAssigned,
    PermissionKey.ApproveLeaveOver2Days,
    PermissionKey.CheckVisitor,
    PermissionKey.ManageLeaveQuotas,
    PermissionKey.ManageHolidays,
  ],
  [SystemRoleKey.ProcessHead]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.ApproveAssigned,
    PermissionKey.ApproveVisitor,
  ],
  [SystemRoleKey.ItAdmin]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.FulfilItRequest,
  ],
  [SystemRoleKey.EnterpriseAdmin]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.CheckVisitor,
    PermissionKey.ManageLeaveQuotas,
    PermissionKey.ConfigureForms,
    PermissionKey.ManageOrg,
    PermissionKey.ManageHolidays,
    PermissionKey.ViewAttendanceReport,
  ],
  // Attendance-report design decision: salary-adjacent report access is explicit (own role),
  // not bundled into HR. Finance keeps the baseline every System role carries.
  [SystemRoleKey.Finance]: [
    PermissionKey.ViewAllForms,
    PermissionKey.SubmitRequest,
    PermissionKey.ViewAttendanceReport,
  ],
};

// ── Auth ───────────────────────────────────────────────────
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** Response for the System Admin's admin-initiated reset (no email fallback, D-30). */
export const adminResetPasswordResponseSchema = z.object({
  temporaryPassword: z.string(),
});
export type AdminResetPasswordResponse = z.infer<typeof adminResetPasswordResponseSchema>;

/** Authenticated user shape returned to the client (no password hash). */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  isSystemAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
  /** Role keys held by this user (e.g. "enterprise-admin") — drives the union sidebar. */
  roles: z.array(z.string()),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

// ── Enterprise registration ──────────────────────────────────
/** Canonical dropdown options — shared by the Registration form and the Enterprise Admin's Company Details form so the two can never drift apart. */
export const INDUSTRY_OPTIONS = [
  'Technology',
  'Finance & Banking',
  'Healthcare',
  'Retail & E-commerce',
  'Manufacturing',
  'Education',
  'Government',
  'Other',
] as const;
export const COMPANY_SIZE_OPTIONS = ['<20', '20–50', '50–120', '120–500', '500–2000', '2000+'] as const;

export const registrationStatus = z.enum(['Pending', 'Accepted', 'Rejected']);
export type RegistrationStatus = z.infer<typeof registrationStatus>;
export const RegistrationStatus = {
  Pending: 'Pending',
  Accepted: 'Accepted',
  Rejected: 'Rejected',
} satisfies Record<string, RegistrationStatus>;

export const registerEnterpriseRequestSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  industry: z.string().min(1, 'Industry is required'),
  size: z.string().min(1, 'Company size is required'),
  website: z.string().optional(),
  contactName: z.string().min(1, 'Admin full name is required'),
  contactEmail: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type RegisterEnterpriseRequest = z.infer<typeof registerEnterpriseRequestSchema>;

export const rejectRegistrationRequestSchema = z.object({
  reason: z.string().min(1, 'A reason is required'),
});
export type RejectRegistrationRequest = z.infer<typeof rejectRegistrationRequestSchema>;

/** Registration queue row shown to the System Admin. */
export const enterpriseRegistrationSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  contactName: z.string(),
  contactEmail: z.string(),
  size: z.string().nullable(),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  status: registrationStatus,
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
});
export type EnterpriseRegistrationDto = z.infer<typeof enterpriseRegistrationSchema>;

export const registrationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: registrationStatus.optional(),
});
export type RegistrationsQuery = z.infer<typeof registrationsQuerySchema>;

export const registrationsResponseSchema = z.object({
  rows: z.array(enterpriseRegistrationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type RegistrationsResponse = z.infer<typeof registrationsResponseSchema>;

// ── Platform overview ────────────────────────────────────────
export const overviewCountsSchema = z.object({
  pending: z.number(),
  active: z.number(),
  users: z.number(),
  suspended: z.number(),
});
export type OverviewCounts = z.infer<typeof overviewCountsSchema>;

export const recentRegistrationSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  contactName: z.string(),
  status: registrationStatus,
  createdAt: z.string(),
});
export type RecentRegistration = z.infer<typeof recentRegistrationSchema>;

export const auditActionSchema = z.enum(['accept', 'reject', 'suspend', 'reactivate']);
export type AuditAction = z.infer<typeof auditActionSchema>;
export const AuditAction = {
  Accept: 'accept',
  Reject: 'reject',
  Suspend: 'suspend',
  Reactivate: 'reactivate',
} satisfies Record<string, AuditAction>;

export const recentActivitySchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: auditActionSchema,
  target: z.string(),
  at: z.string(),
});
export type RecentActivity = z.infer<typeof recentActivitySchema>;

export const overviewResponseSchema = z.object({
  counts: overviewCountsSchema,
  latestRegistrations: z.array(recentRegistrationSchema),
  recentActivity: z.array(recentActivitySchema),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

// ── Notifications ─────────────────────────────────────────────
/** Fields every request-event notification's payload carries, identifying the request it's about. */
const requestNotificationPayloadSchema = z.object({
  requestId: z.string(),
  formKey: z.string(),
  formTitle: z.string(),
});

export const notificationSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('enterprise_registered'),
    payload: z.object({ registrationId: z.string(), companyName: z.string() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To the requester — an approver in the chain approved their request. */
  z.object({
    id: z.string(),
    type: z.literal('request_approved'),
    payload: requestNotificationPayloadSchema.extend({ approverName: z.string() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To the requester — an approver rejected their request. */
  z.object({
    id: z.string(),
    type: z.literal('request_rejected'),
    payload: requestNotificationPayloadSchema.extend({ approverName: z.string(), reason: z.string().nullable() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To an approver — a new request was routed to them. */
  z.object({
    id: z.string(),
    type: z.literal('request_needs_approval'),
    payload: requestNotificationPayloadSchema.extend({ requesterName: z.string() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To the requester — their request's status changed outside the approve/reject flow (e.g. IT fulfilment). */
  z.object({
    id: z.string(),
    type: z.literal('request_status_changed'),
    payload: requestNotificationPayloadSchema.extend({ toState: z.string() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To an approver — a digest of requests still awaiting their decision. */
  z.object({
    id: z.string(),
    type: z.literal('approval_reminder'),
    payload: z.object({ pendingCount: z.number().int() }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To the requester — a co-approver decided but the request isn't final yet (parallel
   *  approval: reject is always terminal, so this only ever fires for an interim approve). */
  z.object({
    id: z.string(),
    type: z.literal('request_decision_update'),
    payload: requestNotificationPayloadSchema.extend({ approverName: z.string(), decision: z.enum(['approved', 'rejected']) }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To a not-yet-decided approver — a peer in the same parallel stage just decided. */
  z.object({
    id: z.string(),
    type: z.literal('approval_peer_decided'),
    payload: requestNotificationPayloadSchema.extend({ approverName: z.string(), decision: z.enum(['approved', 'rejected']) }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
  /** To the original (now-reassigned) approver and to the requester — the sweep auto-escalated
   *  this approval stage (escalation spec: on approved leave, deactivated, or action-window timeout). */
  z.object({
    id: z.string(),
    type: z.literal('approval_escalated'),
    payload: requestNotificationPayloadSchema.extend({ cause: z.enum(['on_leave', 'inactive', 'timeout']) }),
    read: z.boolean(),
    createdAt: z.string(),
  }),
]);
export type NotificationDto = z.infer<typeof notificationSchema>;

// ── Notifications list (notifications-inapp, recipient-scoped) ──
export const notificationsQuerySchema = z.object({
  tab: z.enum(['all', 'unread']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationsResponseSchema = z.object({
  rows: z.array(notificationSchema),
  total: z.number(),
  unreadCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

// ── Enterprises (onboarded tenants) ─────────────────────────────
export const enterpriseStatus = z.enum(['Active', 'Suspended']);
export type EnterpriseStatus = z.infer<typeof enterpriseStatus>;
export const EnterpriseStatus = {
  Active: 'Active',
  Suspended: 'Suspended',
} satisfies Record<string, EnterpriseStatus>;

export const enterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  users: z.number(),
  since: z.string(),
  status: enterpriseStatus,
});
export type EnterpriseDto = z.infer<typeof enterpriseSchema>;

export const enterprisesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Enterprises are a much smaller-cardinality resource than users, hence the higher cap.
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().optional(),
  status: enterpriseStatus.optional(),
});
export type EnterprisesQuery = z.infer<typeof enterprisesQuerySchema>;

export const enterprisesResponseSchema = z.object({
  rows: z.array(enterpriseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type EnterprisesResponse = z.infer<typeof enterprisesResponseSchema>;

// ── Platform users (cross-enterprise) ───────────────────────────
export const platformUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: userStatus.optional(),
  tenantId: z.string().optional(),
});
export type PlatformUsersQuery = z.infer<typeof platformUsersQuerySchema>;

/** Row shown on the System Admin's cross-enterprise Platform Users page. */
export const platformUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  enterpriseName: z.string(),
  status: userStatus,
  createdAt: z.string(),
});
export type PlatformUserDto = z.infer<typeof platformUserSchema>;

export const platformUsersResponseSchema = z.object({
  rows: z.array(platformUserSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type PlatformUsersResponse = z.infer<typeof platformUsersResponseSchema>;

// ── Immutable audit log ──────────────────────────────────────────
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  action: auditActionSchema.optional(),
  entity: z.string().optional(),
  tenantId: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** Row shown on the System Admin's Audit Log page. */
export const auditLogEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string().nullable(),
  actorId: z.string().nullable(),
  tenant: z.string().nullable(),
  tenantId: z.string().nullable(),
  entity: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogResponseSchema = z.object({
  rows: z.array(auditLogEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

// ── Platform settings ─────────────────────────────────────────
export const platformSettingsSchema = z.object({
  forcePasswordChangeOnFirstLogin: z.boolean(),
  allowPublicRegistration: z.boolean(),
  notifyOnNewRegistration: z.boolean(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const updatePlatformSettingsSchema = z.object({
  forcePasswordChangeOnFirstLogin: z.boolean().optional(),
  allowPublicRegistration: z.boolean().optional(),
  notifyOnNewRegistration: z.boolean().optional(),
});

/** Query-string boolean: 'true'→true, 'false'→false, absent→undefined (avoids z.coerce pitfalls). */
const queryBoolean = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
  z.boolean().optional(),
);

// ── Departments master (org-masters) ───────────────────────────
export const departmentHeadSchema = z.object({ id: z.string(), name: z.string() });
export type DepartmentHeadDto = z.infer<typeof departmentHeadSchema>;

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  heads: z.array(departmentHeadSchema),
  memberCount: z.number(),
  archived: z.boolean(),
});
export type DepartmentDto = z.infer<typeof departmentSchema>;

export const departmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  // Pickers pass archived=false to hide retired departments; the master list omits it (shows all).
  archived: queryBoolean,
});
export type DepartmentsQuery = z.infer<typeof departmentsQuerySchema>;

export const departmentsResponseSchema = z.object({
  rows: z.array(departmentSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type DepartmentsResponse = z.infer<typeof departmentsResponseSchema>;

export const createDepartmentRequestSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  headUserIds: z.array(z.string()).default([]),
});
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>;

export const updateDepartmentRequestSchema = createDepartmentRequestSchema;
export type UpdateDepartmentRequest = z.infer<typeof updateDepartmentRequestSchema>;

// ── Org users (tenant-scoped picker; full CRUD lands in Slice 4) ──
export const orgUserPickerSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type OrgUserPickerDto = z.infer<typeof orgUserPickerSchema>;
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsSchema>;

// ── Roles & permissions master (org-masters) ───────────────────
const permissionKeyList = z
  .array(z.string())
  .refine((keys) => keys.every((k) => (ALL_PERMISSION_KEYS as string[]).includes(k)), {
    message: 'Unknown permission key',
  });

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  memberCount: z.number(),
  archived: z.boolean(),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const rolesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.enum(['system', 'custom']).optional(),
  archived: queryBoolean,
});
export type RolesQuery = z.infer<typeof rolesQuerySchema>;

export const rolesResponseSchema = z.object({
  rows: z.array(roleSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type RolesResponse = z.infer<typeof rolesResponseSchema>;

export const createRoleRequestSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  permissions: permissionKeyList,
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const updateRoleRequestSchema = createRoleRequestSchema;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

/** Human-readable summary of a role's permission bundle for the "Scope" column. */
export function permissionScopeSummary(permissions: string[]): string {
  if (permissions.length === 0) return 'No permissions';
  const labels = permissions.map((p) => PERMISSION_LABELS[p as PermissionKey] ?? p);
  if (labels.length <= 3) return labels.join(' · ');
  return `${labels.slice(0, 3).join(' · ')} +${labels.length - 3} more`;
}

// ── User Master (org-masters, tenant-scoped) ───────────────────
export const orgUserRefSchema = z.object({ id: z.string(), name: z.string() });
export type OrgUserRef = z.infer<typeof orgUserRefSchema>;

export const orgUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: userStatus,
  roles: z.array(orgUserRefSchema),
  departments: z.array(orgUserRefSchema),
  createdAt: z.string(),
});
export type OrgUserDto = z.infer<typeof orgUserSchema>;

export const orgUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: userStatus.optional(),
  departmentId: z.string().optional(),
  roleId: z.string().optional(),
});
export type OrgUsersQuery = z.infer<typeof orgUsersQuerySchema>;

export const orgUsersResponseSchema = z.object({
  rows: z.array(orgUserSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type OrgUsersResponse = z.infer<typeof orgUsersResponseSchema>;

export const orgUserStatsSchema = z.object({
  active: z.number(),
  inactive: z.number(),
  pending: z.number(),
  departments: z.number(),
});
export type OrgUserStats = z.infer<typeof orgUserStatsSchema>;

export const createOrgUserRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleIds: z.array(z.string()).default([]),
  departmentIds: z.array(z.string()).default([]),
});
export type CreateOrgUserRequest = z.infer<typeof createOrgUserRequestSchema>;

/** Admin edits an existing user's name, roles, and departments (not email/password). */
export const updateOrgUserRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  roleIds: z.array(z.string()).default([]),
  departmentIds: z.array(z.string()).default([]),
});
export type UpdateOrgUserRequest = z.infer<typeof updateOrgUserRequestSchema>;

// ── Self-registration link (org-masters, tenant-scoped) ────────
/** Admin view of the current self-registration link. */
export const registrationLinkSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
});
export type RegistrationLinkDto = z.infer<typeof registrationLinkSchema>;

export const generateRegistrationLinkRequestSchema = z.object({
  // Per-enterprise expiry window; default 30 minutes (PRD §5A.2, design.md).
  expiryMinutes: z.coerce.number().int().min(5).max(10080).default(30),
});
export type GenerateRegistrationLinkRequest = z.infer<typeof generateRegistrationLinkRequestSchema>;

/** Public info shown on the self-registration page for a valid token. */
export const selfRegistrationInfoSchema = z.object({
  tenantName: z.string(),
});
export type SelfRegistrationInfo = z.infer<typeof selfRegistrationInfoSchema>;

export const selfRegisterRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type SelfRegisterRequest = z.infer<typeof selfRegisterRequestSchema>;

// ── Projects master (org-masters, tenant-scoped) ───────────────
export const projectStatus = z.enum(['active', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: projectStatus,
  pm: orgUserRefSchema.nullable(),
  techLead: orgUserRefSchema.nullable(),
  members: z.array(orgUserRefSchema),
  memberCount: z.number(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const projectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: projectStatus.optional(),
});
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>;

export const projectsResponseSchema = z.object({
  rows: z.array(projectSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;

export const createProjectRequestSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  status: projectStatus.default('active'),
  pmUserId: z.string().nullable().default(null),
  techLeadUserId: z.string().nullable().default(null),
  memberIds: z.array(z.string()).default([]),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = createProjectRequestSchema;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

// ── Form metadata API (form-engine, tenant-scoped) — PRD §6 ────
/** Light list row: latest published version per form key. */
export const formDefinitionSummarySchema = z.object({
  key: z.string(),
  title: z.string(),
  version: z.number().int(),
  renderer: z.enum(['core', 'generic']),
  status: z.enum(['draft', 'published', 'archived']),
});
export type FormDefinitionSummaryDto = z.infer<typeof formDefinitionSummarySchema>;

/** A field as served for rendering (only the columns the FormField row carries). */
export const formFieldDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.unknown().nullable(),
  validation: z.unknown().nullable(),
  visibilityRule: z.unknown().nullable(),
});
export type FormFieldDto = z.infer<typeof formFieldDtoSchema>;

export const formSectionDtoSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  visibilityRule: z.unknown().nullable(),
  fields: z.array(formFieldDtoSchema),
});
export type FormSectionDto = z.infer<typeof formSectionDtoSchema>;

export const formApprovalWorkflowDtoSchema = z.object({
  mode: z.string(),
  stageRules: z.unknown().nullable(),
});
export type FormApprovalWorkflowDto = z.infer<typeof formApprovalWorkflowDtoSchema>;

export const formStatusModelDtoSchema = z.object({
  states: z.unknown(),
  transitions: z.unknown(),
});
export type FormStatusModelDto = z.infer<typeof formStatusModelDtoSchema>;

/** Full latest-published definition served to the renderer. */
export const formDefinitionDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  version: z.number().int(),
  renderer: z.enum(['core', 'generic']),
  status: z.enum(['draft', 'published', 'archived']),
  sections: z.array(formSectionDtoSchema),
  approvalWorkflow: formApprovalWorkflowDtoSchema.nullable(),
  statusModel: formStatusModelDtoSchema.nullable(),
});
export type FormDefinitionDto = z.infer<typeof formDefinitionDtoSchema>;

/** Publish body — the form key comes from the URL, version/renderer/status are server-managed.
 *  `sections` stays loose here so the shared `parseDefinition` can reject an unsupported field
 *  type with a message that names the offending field (rather than an opaque enum error). */
export const publishApprovalWorkflowSchema = z.object({
  mode: z.string().default('parallel'),
  stageRules: z.unknown().optional(),
});
export const publishStatusModelSchema = z.object({
  states: z.unknown(),
  transitions: z.unknown(),
});
export const publishFormRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sections: z.array(z.unknown()),
  approvalWorkflow: publishApprovalWorkflowSchema.optional(),
  statusModel: publishStatusModelSchema.optional(),
});
export type PublishFormRequest = z.infer<typeof publishFormRequestSchema>;

/** Reusable service input — the HTTP body plus the key (Slice 3's seed calls the service directly). */
export interface PublishDefinitionInput extends PublishFormRequest {
  key: string;
}

// ── Form Builder admin API (form-builder, tenant-scoped) — PRD §6 ────
/** Admin list row: the latest version (draft or published) per form key. */
export const formBuilderListItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  renderer: z.enum(['core', 'generic']),
  status: z.enum(['draft', 'published', 'archived']),
  fieldCount: z.number().int(),
  updatedAt: z.string(),
});
export type FormBuilderListItemDto = z.infer<typeof formBuilderListItemSchema>;

/** POST /forms/drafts — create a brand-new custom form as a Draft (version 1, empty field-set). */
export const createFormDraftRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
});
export type CreateFormDraftRequest = z.infer<typeof createFormDraftRequestSchema>;

/** PUT /forms/drafts/:key — replace the draft's field-set wholesale; field keys must be unique. */
export const saveDraftFieldsRequestSchema = z.object({
  fields: z
    .array(formFieldSchema)
    .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, {
      message: 'Field keys must be unique within a form',
    })
    .refine(
      (fields) => {
        const keys = new Set(fields.map((f) => f.key));
        return fields.every(
          (f) => !f.visibilityRule || collectRuleFields(f.visibilityRule.when).every((k) => keys.has(k)),
        );
      },
      { message: 'A visibility condition references a field that is not on this form' },
    ),
});
export type SaveDraftFieldsRequest = z.infer<typeof saveDraftFieldsRequestSchema>;

/** PUT /forms/drafts/:key/routing — replace the draft's approval routing config wholesale. This
 *  schema only checks structural shape; cross-checking each `field`-sourced approver rule against
 *  the draft's actual fields (exists + is a picker type) is done server-side via the shared
 *  `validateStageRules`, which needs the draft's current field set that this request body doesn't carry. */
export const saveDraftRoutingRequestSchema = z.object({
  mode: z.literal('parallel').default('parallel'),
  stageRules: stageRulesSchema,
});
export type SaveDraftRoutingRequest = z.infer<typeof saveDraftRoutingRequestSchema>;

/** PUT /forms/drafts/:key/status-model — replace the draft's status model wholesale. This schema
 *  only checks structural shape so admins can persist a work-in-progress model (e.g. a state added
 *  before its transitions are wired); the shared `validateStatusModel` guardrails (>=1 terminal
 *  state, no orphan states, no self-approval) are only enforced at publish time. */
export const saveDraftStatusModelRequestSchema = statusModelSchema;
export type SaveDraftStatusModelRequest = z.infer<typeof saveDraftStatusModelRequestSchema>;

// ── Request submission (form-engine, tenant-scoped) — PRD §6/§9 ────
export const createRequestSchema = z.object({
  formKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const requestDtoSchema = z.object({
  id: z.string(),
  formKey: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type RequestDto = z.infer<typeof requestDtoSchema>;

/** A `RequestApprover.decision`: `pending` until the approver acts. */
export const approvalDecisionSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** One entry of a request's approval chain — shown alongside a queue card and in the shared
 *  request-detail drawer. `escalatedFromName`/`escalationCause` are set only when the sweep
 *  reassigned this stage (escalation spec's chain annotation). */
export const approvalChainEntrySchema = z.object({
  approverId: z.string(),
  approverName: z.string(),
  roleContext: z.string(),
  decision: approvalDecisionSchema,
  comment: z.string().nullable(),
  escalatedFromName: z.string().nullable(),
  escalationCause: z.enum(['on_leave', 'inactive', 'timeout']).nullable(),
});
export type ApprovalChainEntryDto = z.infer<typeof approvalChainEntrySchema>;

/** GET /requests/:id — one request's full detail, rendered against its own pinned
 *  definition version (not the tenant's current latest) so a republish never changes
 *  how an existing request displays. Reachable by the requester or any snapshotted approver. */
export const requestDetailDtoSchema = z.object({
  id: z.string(),
  formKey: z.string(),
  formTitle: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  definition: formDefinitionDtoSchema,
  requesterId: z.string(),
  approvers: z.array(approvalChainEntrySchema),
  /** Leave/WFH-only computed flags (leave-wfh-requests) — `null` for every other form. */
  overBalance: z.boolean().nullable(),
  specialConditionFlagged: z.boolean().nullable(),
});
export type RequestDetailDto = z.infer<typeof requestDetailDtoSchema>;

/** Body for a status transition — moves a request along a transition declared in its form's status model. */
export const transitionRequestSchema = z.object({
  toState: z.string().min(1),
  note: z.string().optional(),
});
export type TransitionRequestInput = z.infer<typeof transitionRequestSchema>;

/** Body for a decision on a request the caller is a snapshotted approver for (approval-workflow).
 *  `comment` is required when rejecting (enforced server-side, where the message can name it). */
export const decisionRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});
export type DecisionRequestInput = z.infer<typeof decisionRequestSchema>;

// ── Escalation matrix admin config (approval-workflow, Enterprise Admin only) ──
export const escalationRuleDtoSchema = z.object({
  id: z.string(),
  fromContext: z.string(),
  toRoleId: z.string(),
  toRoleName: z.string(),
  actionWindowHours: z.number().int(),
});
export type EscalationRuleDto = z.infer<typeof escalationRuleDtoSchema>;

export const updateEscalationRuleSchema = z.object({
  toRoleId: z.string().min(1),
  actionWindowHours: z.number().int().min(1).max(720),
});
export type UpdateEscalationRuleInput = z.infer<typeof updateEscalationRuleSchema>;

// ── My Requests (form-engine, tenant-scoped) — the requester's own request list ──
export const myRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});
export type MyRequestsQuery = z.infer<typeof myRequestsQuerySchema>;

/** One row of the requester's own request list. */
export const requestListItemSchema = z.object({
  id: z.string(),
  formKey: z.string(),
  formTitle: z.string(),
  status: z.string(),
  createdAt: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  approversTotal: z.number().int(),
  approversDecided: z.number().int(),
});
export type RequestListItemDto = z.infer<typeof requestListItemSchema>;

export const myRequestsResponseSchema = z.object({
  rows: z.array(requestListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type MyRequestsResponse = z.infer<typeof myRequestsResponseSchema>;

// ── Leave Policy & Balances (leave-wfh-requests, tenant-scoped) ──
/** One configured leave type (Leave Policy & Quotas page). `carryForward`/`halfDayAllowed` are
 *  policy toggles stored alongside the type; unpaid types (`isPaid: false`, i.e. LWP) carry no
 *  balance and are exempt from deduction. */
export const leaveTypeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  quota: z.number(),
  isPaid: z.boolean(),
  carryForward: z.boolean(),
  halfDayAllowed: z.boolean(),
});
export type LeaveTypeDto = z.infer<typeof leaveTypeDtoSchema>;

export const createLeaveTypeRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quota: z.number().min(0),
  isPaid: z.boolean(),
  carryForward: z.boolean(),
  halfDayAllowed: z.boolean(),
});
export type CreateLeaveTypeRequest = z.infer<typeof createLeaveTypeRequestSchema>;

/** `name`/`isPaid` are optional so the inline row save (quota + toggles only) stays valid. */
export const updateLeaveTypeRequestSchema = createLeaveTypeRequestSchema.partial({
  name: true,
  isPaid: true,
});
export type UpdateLeaveTypeRequest = z.infer<typeof updateLeaveTypeRequestSchema>;

/** One employee's balance for one leave type, for the My Requests balance cards. */
export const leaveBalanceDtoSchema = z.object({
  leaveTypeId: z.string(),
  leaveTypeName: z.string(),
  used: z.number(),
  total: z.number(),
});
export type LeaveBalanceDto = z.infer<typeof leaveBalanceDtoSchema>;

// ── Approvals Queue (approval-workflow, tenant-scoped) — an approver's own queue ──
export const approvalQueueTabSchema = z.enum(['pending', 'decided']);
export type ApprovalQueueTab = z.infer<typeof approvalQueueTabSchema>;

export const approvalQueueQuerySchema = z.object({
  tab: approvalQueueTabSchema.default('pending'),
  /** Filters to one of the caller's own approver roles, when they hold more than one (design.md "Approving as"). */
  roleContext: z.string().optional(),
});
export type ApprovalQueueQuery = z.infer<typeof approvalQueueQuerySchema>;

/** One card on the Approvals Queue page — a request awaiting or already decided by the caller. */
export const approvalQueueItemSchema = z.object({
  requestId: z.string(),
  formKey: z.string(),
  formTitle: z.string(),
  requesterId: z.string(),
  requesterName: z.string(),
  requesterJobTitle: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  submittedAt: z.string(),
  status: z.string(),
  /** The caller's own decision on this request. */
  myDecision: approvalDecisionSchema,
  chain: z.array(approvalChainEntrySchema),
  /** Leave/WFH-only computed flags (leave-wfh-requests) — `null` for every other form. */
  overBalance: z.boolean().nullable(),
  specialConditionFlagged: z.boolean().nullable(),
});
export type ApprovalQueueItemDto = z.infer<typeof approvalQueueItemSchema>;

export const approvalQueueResponseSchema = z.object({
  rows: z.array(approvalQueueItemSchema),
  awaitingCount: z.number(),
  decidedCount: z.number(),
});
export type ApprovalQueueResponse = z.infer<typeof approvalQueueResponseSchema>;

// ── Enterprise details (self-service, Enterprise Admin only) ───
/** Company-level info — editable only by the tenant's own Enterprise Admin, never by System Admin. */
export const enterpriseDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  size: z.string().nullable(),
  website: z.string().nullable(),
});
export type EnterpriseDetailsDto = z.infer<typeof enterpriseDetailsSchema>;

export const updateEnterpriseDetailsRequestSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});
export type UpdateEnterpriseDetailsRequest = z.infer<typeof updateEnterpriseDetailsRequestSchema>;

// ── Profile (self-service, any authenticated user) ─────────────
export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  location: z.string().nullable(),
  // Admin-managed, shown read-only on the profile.
  roles: z.array(z.string()),
  departments: z.array(z.string()),
});
export type ProfileDto = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// ── Front Desk (visitor-management, tenant-scoped) ──
/** One visitor registration on today's Front Desk view. */
export const frontDeskVisitorDtoSchema = z.object({
  requestId: z.string(),
  visitorName: z.string(),
  mobile: z.string(),
  hostName: z.string(),
  purpose: z.string(),
  visitDatetime: z.string().nullable(),
  outTime: z.string().nullable(),
  laptopDetails: z.string().nullable(),
  status: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
});
export type FrontDeskVisitorDto = z.infer<typeof frontDeskVisitorDtoSchema>;

/** GET /front-desk/today — today's visitors (tenant timezone), split by lifecycle bucket. */
export const frontDeskTodayResponseSchema = z.object({
  expected: z.array(frontDeskVisitorDtoSchema),
  onSite: z.array(frontDeskVisitorDtoSchema),
  checkedOut: z.array(frontDeskVisitorDtoSchema),
});
export type FrontDeskTodayResponse = z.infer<typeof frontDeskTodayResponseSchema>;

// ── Item Catalog (it-requests, tenant-scoped, Enterprise Admin CRUD) ──
export const itemCatalogTypeSchema = z.enum(['software', 'hardware']);
export type ItemCatalogType = z.infer<typeof itemCatalogTypeSchema>;

export const itemCatalogDtoSchema = z.object({
  id: z.string(),
  type: itemCatalogTypeSchema,
  name: z.string(),
  archived: z.boolean(),
  /** Blocks hard delete (item-catalog spec) — true when any request has ever named this item. */
  referenced: z.boolean(),
});
export type ItemCatalogDto = z.infer<typeof itemCatalogDtoSchema>;

export const createItemCatalogRequestSchema = z.object({
  type: itemCatalogTypeSchema,
  name: z.string().min(1, 'Name is required'),
});
export type CreateItemCatalogRequest = z.infer<typeof createItemCatalogRequestSchema>;

export const updateItemCatalogRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  archived: z.boolean().optional(),
});
export type UpdateItemCatalogRequest = z.infer<typeof updateItemCatalogRequestSchema>;

// ── IT Fulfilment Queue (it-requests, IT Admin only) ──
export const fulfilmentQueueTabSchema = z.enum(['open', 'fulfilled']);
export type FulfilmentQueueTab = z.infer<typeof fulfilmentQueueTabSchema>;

export const fulfilmentQueueItemSchema = z.object({
  requestId: z.string(),
  requesterName: z.string(),
  departmentId: z.string().nullable(),
  category: z.string(), // 'Software' | 'Hardware', from the submitted access_type
  items: z.array(z.string()),
  impact: z.string().nullable(),
  status: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  fulfilledAt: z.string().nullable(),
});
export type FulfilmentQueueItemDto = z.infer<typeof fulfilmentQueueItemSchema>;

export const fulfilmentQueueResponseSchema = z.object({
  rows: z.array(fulfilmentQueueItemSchema),
  queuedCount: z.number(),
  inProgressCount: z.number(),
  fulfilledCount: z.number(),
});
export type FulfilmentQueueResponse = z.infer<typeof fulfilmentQueueResponseSchema>;

// ── Absence Visibility & Calendar (absence-visibility, tenant-scoped, PRD §11A) ──
export const absenceTypeSchema = z.enum(['leave', 'wfh']);
export type AbsenceType = z.infer<typeof absenceTypeSchema>;

export const absenceQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  projectId: z.string().optional(),
  departmentId: z.string().optional(),
  type: absenceTypeSchema.optional(),
  personId: z.string().optional(),
});
export type AbsenceQuery = z.infer<typeof absenceQuerySchema>;

/** One approved Leave/WFH absence, shaped by the viewer's §11A tier — `reason` is present only
 *  for HR viewers; it is omitted (not merely null) from every other role's response. */
export const absenceEntryDtoSchema = z.object({
  requestId: z.string(),
  personId: z.string(),
  personName: z.string(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  type: absenceTypeSchema,
  /** Plain `YYYY-MM-DD` (a calendar day, not an instant) — matches `OverCapDayDto.date`. */
  startDate: z.string(),
  endDate: z.string(),
  halfDayCount: z.number().nullable(),
  reason: z.string().nullable().optional(),
});
export type AbsenceEntryDto = z.infer<typeof absenceEntryDtoSchema>;

export const absenceVisibilityScopeSchema = z.enum(['hr', 'management', 'pm-tl']);
export type AbsenceVisibilityScope = z.infer<typeof absenceVisibilityScopeSchema>;

export const absenceRangeResponseSchema = z.object({
  rows: z.array(absenceEntryDtoSchema),
  scope: absenceVisibilityScopeSchema,
});
export type AbsenceRangeResponse = z.infer<typeof absenceRangeResponseSchema>;

export const overCapQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  projectId: z.string().optional(),
});
export type OverCapQuery = z.infer<typeof overCapQuerySchema>;

export const overCapDayDtoSchema = z.object({
  date: z.string(),
  count: z.number(),
  cap: z.number(),
  people: z.array(z.object({ personId: z.string(), personName: z.string() })),
});
export type OverCapDayDto = z.infer<typeof overCapDayDtoSchema>;

export const overCapResponseSchema = z.object({
  cap: z.number(),
  days: z.array(overCapDayDtoSchema),
});
export type OverCapResponse = z.infer<typeof overCapResponseSchema>;

/** The tenant's configured concurrent-absence cap (Leave Policy page), used by the Admin
 *  Absence Calendar's over-cap warning panel. */
export const absenceCapDtoSchema = z.object({ cap: z.number() });
export type AbsenceCapDto = z.infer<typeof absenceCapDtoSchema>;

export const updateAbsenceCapRequestSchema = z.object({ cap: z.number().int().min(1) });
export type UpdateAbsenceCapRequest = z.infer<typeof updateAbsenceCapRequestSchema>;

// ── Slack Integration (slack-integration, tenant-scoped, Enterprise Admin only, PRD §11) ──
export const slackConfigStatusSchema = z.enum(['disconnected', 'connected', 'error']);
export type SlackConfigStatus = z.infer<typeof slackConfigStatusSchema>;

/** Never carries credential material — connection status only. */
export const slackConfigDtoSchema = z.object({
  status: slackConfigStatusSchema,
  workspaceName: z.string().nullable(),
  defaultChannel: z.string().nullable(),
  notifyApproversOnNewRequest: z.boolean(),
  notifyRequesterOnDecision: z.boolean(),
  notifyRequesterOnStatusChange: z.boolean(),
  digestEnabled: z.boolean(),
  digestChannel: z.string().nullable(),
  digestTime: z.string().nullable(),
  reminderEnabled: z.boolean(),
  lastErrorMessage: z.string().nullable(),
});
export type SlackConfigDto = z.infer<typeof slackConfigDtoSchema>;

export const connectSlackRequestSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
  signingSecret: z.string().min(1, 'Signing secret is required'),
  defaultChannel: z.string().min(1, 'Default channel is required'),
});
export type ConnectSlackRequest = z.infer<typeof connectSlackRequestSchema>;

export const updateSlackSettingsRequestSchema = z.object({
  defaultChannel: z.string().min(1).optional(),
  notifyApproversOnNewRequest: z.boolean(),
  notifyRequesterOnDecision: z.boolean(),
  notifyRequesterOnStatusChange: z.boolean(),
  digestEnabled: z.boolean(),
  digestChannel: z.string().nullable().optional(),
  digestTime: z.string().nullable().optional(),
  reminderEnabled: z.boolean(),
});
export type UpdateSlackSettingsRequest = z.infer<typeof updateSlackSettingsRequestSchema>;

// ── Notification Preferences (reporting-and-polish, per-user, within tenant policy) ──
/** Every tenant-user-facing notification type, its mandatory-ness (tenant policy — cannot be
 *  muted on any channel), and a human label for the Profile page. `enterprise_registered` is
 *  System-Admin-only and not part of this per-user catalog. */
export const NOTIFICATION_TYPE_CATALOG: { type: string; label: string; mandatory: boolean }[] = [
  { type: 'request_needs_approval', label: 'A request needs your approval', mandatory: true },
  { type: 'request_approved', label: 'Your request was approved', mandatory: false },
  { type: 'request_rejected', label: 'Your request was rejected', mandatory: false },
  { type: 'request_status_changed', label: 'Your request status changed', mandatory: false },
  { type: 'request_decision_update', label: 'A co-approver decided on your request', mandatory: false },
  { type: 'approval_peer_decided', label: 'A peer approver decided', mandatory: false },
  { type: 'approval_reminder', label: 'Reminder: requests awaiting your approval', mandatory: false },
  { type: 'approval_escalated', label: 'An approval was escalated to you', mandatory: false },
];

export const notificationChannelSchema = z.enum(['inApp', 'slack']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationPreferenceRowSchema = z.object({
  type: z.string(),
  label: z.string(),
  mandatory: z.boolean(),
  inApp: z.boolean(),
  slack: z.boolean(),
});
export type NotificationPreferenceRow = z.infer<typeof notificationPreferenceRowSchema>;

export const notificationPreferencesResponseSchema = z.object({ rows: z.array(notificationPreferenceRowSchema) });
export type NotificationPreferencesResponse = z.infer<typeof notificationPreferencesResponseSchema>;

export const updateNotificationPreferenceRequestSchema = z.object({
  type: z.string().min(1),
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});
export type UpdateNotificationPreferenceRequest = z.infer<typeof updateNotificationPreferenceRequestSchema>;

// ── Reporting & Dashboards (reporting-and-polish, role- and tenant-scoped) ──
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const reportRangeQuerySchema = z.object({
  from: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  to: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  projectId: z.string().optional(),
});
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const requestVolumeRowSchema = z.object({
  formKey: z.string(),
  formTitle: z.string(),
  status: z.string(),
  count: z.number(),
});
export type RequestVolumeRow = z.infer<typeof requestVolumeRowSchema>;

export const absenceTrendPointSchema = z.object({ date: z.string(), count: z.number() });
export type AbsenceTrendPoint = z.infer<typeof absenceTrendPointSchema>;

/** `scope` is the same §11A tier `GET /absences` resolves — dashboards inherit it rather than
 *  defining a parallel permission model (design.md). */
export const reportSummaryResponseSchema = z.object({
  scope: absenceVisibilityScopeSchema,
  requestVolumes: z.array(requestVolumeRowSchema),
  avgApprovalTurnaroundHours: z.number().nullable(),
  absenceTrend: z.array(absenceTrendPointSchema),
});
export type ReportSummaryResponse = z.infer<typeof reportSummaryResponseSchema>;

// ── Visitor Signatures (reporting-and-polish, Front Desk check-in) ──
/** `signature` is a data: URL (canvas `toDataURL()` output) — decoded and written to object
 *  storage server-side; never persisted as-is. */
export const checkInWithSignatureRequestSchema = z.object({
  signature: z.string().min(1),
  consent: z.boolean(),
});
export type CheckInWithSignatureRequest = z.infer<typeof checkInWithSignatureRequestSchema>;

export const signedUrlResponseSchema = z.object({ url: z.string() });
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;

// ── Holidays & Attendance Report (attendance-report, Finance payroll) ──
/** A calendar day as `YYYY-MM-DD` — must be a real date (rejects e.g. 2026-02-30). */
export const holidayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a valid calendar date');

export const holidayCreateSchema = z.object({
  date: holidayDateSchema,
  name: z.string().trim().min(1).max(100),
});
export type HolidayCreate = z.infer<typeof holidayCreateSchema>;

export const holidayUpdateSchema = holidayCreateSchema
  .partial()
  .refine((v) => v.date !== undefined || v.name !== undefined, 'At least one field is required');
export type HolidayUpdate = z.infer<typeof holidayUpdateSchema>;

export const holidayListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
export type HolidayListQuery = z.infer<typeof holidayListQuerySchema>;

/** `date` is a plain `YYYY-MM-DD` calendar day, matching `AbsenceEntryDto.startDate`. */
export const holidayDtoSchema = z.object({
  id: z.string(),
  date: z.string(),
  name: z.string(),
});
export type HolidayDto = z.infer<typeof holidayDtoSchema>;

// ── Smart Search (smart-search, tool-calling LLM assistant, tenant-scoped) ──
// Placed here, after departmentSchema/projectSchema/leaveBalanceDtoSchema/approvalQueueItemSchema/
// holidayDtoSchema, rather than near the module's other conversational-assistant types: the
// response union below references all of them directly, and they're `const`-declared, so
// referencing them before this point would throw (temporal dead zone).
export const smartSearchChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});
export type SmartSearchChatMessage = z.infer<typeof smartSearchChatMessageSchema>;

/** `history` is the prior turns of the same thread; the server trims it to a small recent
 *  window before sending it to the model — this cap is just a request-size guardrail.
 *  `conversationId` resumes a persisted thread (its stored history is loaded server-side and
 *  `history` is then ignored); omit it to start a new thread, whose id comes back on the response. */
export const smartSearchRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(smartSearchChatMessageSchema).max(20).optional(),
  conversationId: z.string().optional(),
});
export type SmartSearchRequest = z.infer<typeof smartSearchRequestSchema>;

export const smartSearchToolNameSchema = z.enum([
  'queryAbsences',
  'queryUsers',
  'queryMyRequests',
  'queryDepartments',
  'queryProjects',
  'queryHolidays',
  'queryMyLeaveBalances',
  'queryMyApprovals',
  'queryFrontDeskVisitors',
]);
export type SmartSearchToolName = z.infer<typeof smartSearchToolNameSchema>;

/** `toolUsed` is `null` when the model matched no tool (declined) or named an unrecognized one.
 *  `denied` is true only when a matched tool's executor rejected the viewer for permission — in
 *  that case `rows` is always empty regardless of which tool was involved. `conversationId` is
 *  always the persisted thread this turn was saved to — the caller's own on resume, or a
 *  freshly-created one when the request omitted `conversationId`. */
export const smartSearchResponseSchema = z.discriminatedUnion('toolUsed', [
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryAbsences'),
    denied: z.boolean(),
    rows: z.array(absenceEntryDtoSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryUsers'),
    denied: z.boolean(),
    rows: z.array(orgUserSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryMyRequests'),
    denied: z.boolean(),
    rows: z.array(requestListItemSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryDepartments'),
    denied: z.boolean(),
    rows: z.array(departmentSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryProjects'),
    denied: z.boolean(),
    rows: z.array(projectSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryHolidays'),
    denied: z.boolean(),
    rows: z.array(holidayDtoSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryMyLeaveBalances'),
    denied: z.boolean(),
    rows: z.array(leaveBalanceDtoSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryMyApprovals'),
    denied: z.boolean(),
    rows: z.array(approvalQueueItemSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal('queryFrontDeskVisitors'),
    denied: z.boolean(),
    rows: z.array(frontDeskVisitorDtoSchema),
  }),
  z.object({
    reply: z.string(),
    conversationId: z.string(),
    toolUsed: z.literal(null),
    denied: z.boolean(),
    rows: z.tuple([]),
  }),
]);
export type SmartSearchResponse = z.infer<typeof smartSearchResponseSchema>;

/** One persisted message in a Smart Search conversation thread, as returned by the
 *  conversation-detail endpoint — distinct from `smartSearchChatMessageSchema`, which is the
 *  ephemeral shape a request carries as prior-turn context. */
export const smartSearchConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
});
export type SmartSearchConversationMessageDto = z.infer<typeof smartSearchConversationMessageSchema>;

/** One row of the Smart Search thread-history list; `title` is derived server-side (e.g. from
 *  the thread's first user message) when no explicit title was set. */
export const smartSearchConversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmartSearchConversationSummaryDto = z.infer<typeof smartSearchConversationSummarySchema>;

export const smartSearchConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SmartSearchConversationsQuery = z.infer<typeof smartSearchConversationsQuerySchema>;

export const smartSearchConversationsResponseSchema = z.object({
  rows: z.array(smartSearchConversationSummarySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SmartSearchConversationsResponse = z.infer<typeof smartSearchConversationsResponseSchema>;

/** Full thread detail returned when resuming a past conversation, messages oldest first. */
export const smartSearchConversationDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(smartSearchConversationMessageSchema),
});
export type SmartSearchConversationDetail = z.infer<typeof smartSearchConversationDetailSchema>;

/** One fact/preference the assistant has inferred about the caller across conversations
 *  (long-term memory) — strictly tenant- and user-scoped, never shared across users. */
export const smartSearchMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmartSearchMemoryDto = z.infer<typeof smartSearchMemorySchema>;

export const smartSearchMemoriesResponseSchema = z.object({
  rows: z.array(smartSearchMemorySchema),
});
export type SmartSearchMemoriesResponse = z.infer<typeof smartSearchMemoriesResponseSchema>;

/** Body for editing a remembered fact's text in place. */
export const smartSearchMemoryUpdateSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});
export type SmartSearchMemoryUpdate = z.infer<typeof smartSearchMemoryUpdateSchema>;

export const attendanceReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM'),
  departmentId: z.string().optional(),
  /** false/absent → Active users only; true additionally includes Inactive/Suspended (never Pending). */
  includeInactive: queryBoolean,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;

/** Day figures move in 0.5 steps (half-days); `payableDays = workingDays − unpaidLeaveDays`. */
export const attendanceReportRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  departments: z.array(z.string()),
  status: z.string(),
  joinedAt: z.string(),
  workingDays: z.number(),
  wfhDays: z.number(),
  paidLeaveDays: z.number(),
  unpaidLeaveDays: z.number(),
  officeDays: z.number(),
  payableDays: z.number(),
});
export type AttendanceReportRow = z.infer<typeof attendanceReportRowSchema>;

export const attendanceReportResponseSchema = z.object({
  month: z.string(),
  isPartialMonth: z.boolean(),
  calendarDays: z.number(),
  weekendDays: z.number(),
  holidayCount: z.number(),
  workingDays: z.number(),
  rows: z.array(attendanceReportRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AttendanceReportResponse = z.infer<typeof attendanceReportResponseSchema>;
