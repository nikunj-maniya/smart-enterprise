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
