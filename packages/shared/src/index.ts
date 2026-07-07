import { z } from 'zod';

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
export const notificationSchema = z.object({
  id: z.string(),
  type: z.literal('enterprise_registered'),
  payload: z.object({ registrationId: z.string(), companyName: z.string() }),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

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

/** Body for a status transition — moves a request along a transition declared in its form's status model. */
export const transitionRequestSchema = z.object({
  toState: z.string().min(1),
  note: z.string().optional(),
});
export type TransitionRequestInput = z.infer<typeof transitionRequestSchema>;

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
