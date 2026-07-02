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

export const auditActionSchema = z.enum(['accept', 'reject']);
export type AuditAction = z.infer<typeof auditActionSchema>;

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
