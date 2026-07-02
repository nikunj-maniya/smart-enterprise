import { z } from 'zod';

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

/** Authenticated user shape returned to the client (no password hash). */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  isSystemAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
  tenantId: z.string().nullable(),
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
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsSchema>;
